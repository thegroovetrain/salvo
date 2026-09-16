// The in-match keyboard chokepoint (Story 2.1, re-cut in Story 8.5): pure
// helpers (rudderFrom/panAxesFrom/nextPrimedSlot/slotHoldsAbility/
// textEntryFocused) plus the KeyboardInput adapter driven through real window
// keydown/keyup events (jsdom). Pins the ruled behavior: weapon switch-to /
// same-key revert, ability FIFO + capped-press denied feedback, refit-or-
// nothing digits, modal suspension of slot keys, the text-entry guard, and
// preventDefault hygiene for every bound key (TAB + Space included) while
// modifier chords stay native.
//
// STORY 8.5 MOVED THE SCHEME ONTO THE NINE-SLOT SPINE:
//   • Q/E/R address the three GENERIC weapon slots 2/3/4 (WEAPON_SLOTS), not
//     "the two class specials plus the pickup" — every one of them is EMPTY at
//     0:00 and is filled by a card;
//   • SHIFT is slot 1's (the boost's) key, as a TAP — the boost stopped being a
//     Torpedo Boat privilege (epic-8 amendment 23);
//   • a weapon key or a hotbar click on an EMPTY slot DENIES on the client
//     (onEmptySlotDenied — amendment 26), where it used to be silent, and the
//     combat lock still wins SILENTLY over that denial;
//   • the prime's auto-revert is now owed at the pointer RELEASE (UX-DR42) —
//     armReleaseRevert / consumeReleaseRevert, and any prime change clears it;
//   • the digits are UNTOUCHED (amendment 27 — the belt cannot be stocked
//     before Story 8.7, so 1-4 stay refit-only).

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEAL_CHOICE, SLOT_BOOST, SLOT_GUN, WEAPON_SLOTS, type EquipmentId } from '@salvo/shared';
import {
  rudderFrom,
  panAxesFrom,
  nextPrimedSlot,
  slotHoldsAbility,
  textEntryFocused,
  BOOST_KEY_CODES,
  SLOT_KEY_CODES,
  REFIT_DIGIT_CODES,
  KeyboardInput,
  type KeyboardHooks,
} from '../input/keyboard.js';

/** The three weapon slots by their keys — Q, E, R (slots 2, 3, 4). */
const [Q_SLOT, E_SLOT, R_SLOT] = WEAPON_SLOTS;
/** A Torpedo Boat's seeded torpedo lands in the FIRST empty weapon slot: Q. */
const TORP = Q_SLOT;
/** The boost's slot — slot 1 on every captain hull (amendment 23). */
const BOOST = SLOT_BOOST;

/** A fully-fitted loadout: the boost plus all three weapon slots. The fitted
 *  hook FAILS CLOSED, so every suite that exercises priming/activation must wire
 *  it — a bare KeyboardInput has no fitted slots at all (Story 2.1 review fix).
 *  The consumable belt (5-8) stays empty: Story 8.7 stocks it. */
const ALL_FITTED = (slot: number): boolean => slot >= SLOT_BOOST && slot <= R_SLOT;

describe('rudderFrom (held A/D)', () => {
  it('is zero with no keys', () => {
    expect(rudderFrom(new Set())).toBe(0);
  });

  it('D = right (+1), A = left (-1), with arrow aliases', () => {
    expect(rudderFrom(new Set(['KeyD']))).toBe(1);
    expect(rudderFrom(new Set(['KeyA']))).toBe(-1);
    expect(rudderFrom(new Set(['ArrowRight']))).toBe(1);
    expect(rudderFrom(new Set(['ArrowLeft']))).toBe(-1);
  });

  it('opposing keys cancel; W/S and unrelated keys are ignored', () => {
    expect(rudderFrom(new Set(['KeyA', 'KeyD']))).toBe(0);
    expect(rudderFrom(new Set(['KeyW', 'KeyS', 'Space']))).toBe(0);
  });
});

describe('panAxesFrom (spectator held-WASD, both axes)', () => {
  it('reads held W/S as throttle and A/D as rudder', () => {
    expect(panAxesFrom(new Set(['KeyW', 'KeyD']))).toEqual({ throttle: 1, rudder: 1 });
    expect(panAxesFrom(new Set(['KeyS', 'KeyA']))).toEqual({ throttle: -1, rudder: -1 });
    expect(panAxesFrom(new Set(['ArrowUp', 'ArrowLeft']))).toEqual({ throttle: 1, rudder: -1 });
  });

  it('opposing keys cancel on both axes', () => {
    expect(panAxesFrom(new Set(['KeyW', 'KeyS']))).toEqual({ throttle: 0, rudder: 0 });
    expect(panAxesFrom(new Set(['KeyA', 'KeyD']))).toEqual({ throttle: 0, rudder: 0 });
  });
});

describe('the ratified binding tables', () => {
  it('Q/E/R map to the three WEAPON slots 2/3/4 — the gun (slot 0) has NO key', () => {
    expect(SLOT_KEY_CODES).toEqual({ KeyQ: 2, KeyE: 3, KeyR: 4 });
    // …and they are exactly WEAPON_SLOTS, in order: the key table reads the
    // shared tuple rather than re-typing literals, so a future re-cut of the
    // slot grammar moves the keys with it instead of silently desyncing.
    expect(Object.values(SLOT_KEY_CODES)).toEqual([...WEAPON_SLOTS]);
    expect(Object.values(SLOT_KEY_CODES)).not.toContain(SLOT_GUN);
    expect(Object.values(SLOT_KEY_CODES)).not.toContain(SLOT_BOOST);
  });

  it('BOTH shift keys address slot 1 — the boost, on every captain hull', () => {
    expect([...BOOST_KEY_CODES]).toEqual(['ShiftLeft', 'ShiftRight']);
    expect(SLOT_BOOST).toBe(1);
  });

  it('digits 1–4 (top row + numpad) map to refit-card picks 0..3', () => {
    expect(REFIT_DIGIT_CODES.Digit1).toBe(0);
    expect(REFIT_DIGIT_CODES.Digit4).toBe(3);
    expect(REFIT_DIGIT_CODES.Numpad1).toBe(0);
    expect(REFIT_DIGIT_CODES.Numpad4).toBe(3);
  });

  // DAMAGE CONTROL (cycle 46): digit 5 is the always-available heal, addressed
  // by the reserved NEGATIVE wire sentinel rather than an index — a positive
  // one would collide with a real card the moment CONFIG.offer.size moved.
  it('digit 5 (top row + numpad) maps to HEAL_CHOICE, never to an offer index', () => {
    expect(REFIT_DIGIT_CODES.Digit5).toBe(HEAL_CHOICE);
    expect(REFIT_DIGIT_CODES.Numpad5).toBe(HEAL_CHOICE);
    expect(HEAL_CHOICE).toBeLessThan(0);
    for (const [code, choice] of Object.entries(REFIT_DIGIT_CODES)) {
      if (code !== 'Digit5' && code !== 'Numpad5') expect(choice, code).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('nextPrimedSlot — switch-to / same-key revert', () => {
  it('priming a fresh weapon slot from the gun switches to that slot', () => {
    expect(nextPrimedSlot(SLOT_GUN, TORP)).toBe(TORP);
    expect(nextPrimedSlot(SLOT_GUN, E_SLOT)).toBe(E_SLOT);
  });

  it('pressing the SAME primed key again reverts to the gun (amendment 5)', () => {
    expect(nextPrimedSlot(TORP, TORP)).toBe(SLOT_GUN);
    expect(nextPrimedSlot(E_SLOT, E_SLOT)).toBe(SLOT_GUN);
  });

  it('switching directly between two primed slots swaps (no intermediate revert)', () => {
    expect(nextPrimedSlot(TORP, E_SLOT)).toBe(E_SLOT);
    expect(nextPrimedSlot(E_SLOT, TORP)).toBe(TORP);
  });
});

describe('slotHoldsAbility — the loadout-driven weapon/ability split', () => {
  /** A nine-slot array: gun, boost, three weapon slots, the four-slot belt. */
  const nine = (...weapons: (string | null)[]): readonly (EquipmentId | null)[] =>
    ['gun', 'speedBoost', ...weapons, null, null, null, null, null].slice(0, 9) as (EquipmentId | null)[];

  // Story 8.5: every captain has the SAME shape. What differs is what their
  // seed/cards put in the weapon row — the Torpedo Boat's heavy torpedo, the
  // Battleship's broadside + star shells, the Mine Layer's mine.
  const TB_SLOTS = nine('heavyTorpedo');
  const BB_SLOTS = nine('broadside', 'starShells');
  const ML_SLOTS = nine('navalMines');

  it('is true only for a slot holding EQUIPMENT_IS_WEAPON:false equipment', () => {
    expect(slotHoldsAbility(TB_SLOTS, SLOT_BOOST)).toBe(true); // speedBoost
    expect(slotHoldsAbility(TB_SLOTS, SLOT_GUN)).toBe(false); // gun
    expect(slotHoldsAbility(TB_SLOTS, Q_SLOT)).toBe(false); // torpedo
    expect(slotHoldsAbility(BB_SLOTS, Q_SLOT)).toBe(false); // the broadside is a weapon
    expect(slotHoldsAbility(BB_SLOTS, E_SLOT)).toBe(false); // star shells is a weapon
  });

  it('EVERY captain hull now answers true at SLOT_BOOST (amendment 23)', () => {
    // The boost stopped being a Torpedo Boat privilege in Story 8.5: slot 1
    // holds the same `speedBoost` module at the same numbers on all three
    // hulls, so a Battleship and a Mine Layer activate on Shift exactly as the
    // TB always did.
    for (const slots of [TB_SLOTS, BB_SLOTS, ML_SLOTS]) {
      expect(slotHoldsAbility(slots, SLOT_BOOST)).toBe(true);
    }
  });

  it('PIN HELD: NO WEAPON SLOT activates — the mine and the buoy both prime', () => {
    // Story 2.8, amendment 45: the mine primes on its key and places on a click
    // inside its rear arc. Story 7-5 wave 2 (R2.7) did the same to the RADAR
    // BUOY that replaced the decoy rack. Story 8.5 (amendment 22) then took the
    // buoy out of every fit — it is named here as a bare id because no hull can
    // carry it any more, and the split it declares is still the pin.
    expect(slotHoldsAbility(ML_SLOTS, Q_SLOT)).toBe(false);
    expect(slotHoldsAbility(nine('radarBuoy'), Q_SLOT)).toBe(false);
    expect(slotHoldsAbility(ML_SLOTS, SLOT_GUN)).toBe(false); // gun stays a weapon
  });

  it('is false for empty and out-of-range slots', () => {
    expect(slotHoldsAbility(TB_SLOTS, E_SLOT)).toBe(false); // an empty weapon slot
    expect(slotHoldsAbility(TB_SLOTS, 8)).toBe(false); // an empty belt slot
    expect(slotHoldsAbility(TB_SLOTS, 12)).toBe(false); // out of range
  });
});

// --- KeyboardInput adapter: real keydown/keyup edges via window events -------

/** Dispatch a keydown; returns true if the chokepoint preventDefault'd it. */
function press(code: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { code, cancelable: true, ...init });
  return !window.dispatchEvent(e); // dispatchEvent → false when preventDefault was called
}
function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('KeyboardInput — telegraph driving', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  it('taps W/S to step the throttle order one detent per keydown edge', () => {
    kb = new KeyboardInput();
    kb.attach();
    expect(kb.axes().throttle).toBe(0);
    press('KeyW');
    expect(kb.axes().throttle).toBe(0.25);
    press('KeyW');
    expect(kb.axes().throttle).toBe(0.5);
    press('KeyS');
    expect(kb.axes().throttle).toBe(0.25);
    expect(kb.throttleIndex).toBe(5);
  });

  it('ignores OS key-repeat so holding W does not run up the scale', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW'); // one real tap
    press('KeyW', { repeat: true }); // auto-repeat while held
    press('KeyW', { repeat: true });
    expect(kb.throttleIndex).toBe(5); // still one step from neutral (4)
    expect(kb.throttle).toBe(0.25);
  });

  it('fires onDetent with the direction + changed flag (silent at the end stop)', () => {
    const calls: Array<[number, boolean]> = [];
    kb = new KeyboardInput({ onDetent: (dir, changed) => calls.push([dir, changed]) });
    kb.attach();
    for (let i = 0; i < 5; i++) press('KeyW'); // 4 real steps then the stop
    expect(calls).toEqual([
      [1, true],
      [1, true],
      [1, true],
      [1, true],
      [1, false],
    ]);
  });

  it('drives rudder from held A/D independently of the throttle order', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW'); // order +0.25
    press('KeyD'); // rudder held right
    expect(kb.axes()).toEqual({ throttle: 0.25, rudder: 1 });
    release('KeyD');
    expect(kb.axes()).toEqual({ throttle: 0.25, rudder: 0 });
  });

  it('resetThrottle returns the order to neutral without dropping held keys', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW');
    press('KeyW');
    press('KeyD'); // held rudder
    expect(kb.throttle).toBe(0.5);
    kb.resetThrottle();
    expect(kb.throttle).toBe(0);
    expect(kb.axes().rudder).toBe(1); // rudder still held
  });

  it('clearKeys drops held keys but PRESERVES the throttle order (not a held key)', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW');
    press('KeyW'); // order 0.5
    press('KeyD'); // held rudder
    kb.clearKeys();
    expect(kb.axes().rudder).toBe(0); // held keys gone
    expect(kb.throttle).toBe(0.5); // deliberate order survives
  });

  it('blur clears held keys but keeps the throttle order steaming', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW');
    press('KeyD');
    window.dispatchEvent(new Event('blur'));
    expect(kb.axes().rudder).toBe(0);
    expect(kb.throttle).toBe(0.25);
  });

  it('held W/S still populate the pan axes (for spectator free-pan)', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW'); // steps the order AND records the held key
    expect(kb.panAxes()).toEqual({ throttle: 1, rudder: 0 });
    release('KeyW');
    expect(kb.panAxes()).toEqual({ throttle: 0, rudder: 0 });
  });
});

describe('KeyboardInput — Q/E/R weapon switch-to (prime toggle)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  it('Q primes weapon slot 2; the same key again reverts to the gun', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    expect(kb.primedSlot).toBe(SLOT_GUN);
    press('KeyQ');
    expect(kb.primedSlot).toBe(TORP);
    press('KeyQ'); // same key again — switch back (amendment 5)
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('switching Q → E swaps the prime directly (two weapons in the row)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    expect(kb.primedSlot).toBe(Q_SLOT);
    press('KeyE');
    expect(kb.primedSlot).toBe(E_SLOT);
    press('KeyR');
    expect(kb.primedSlot).toBe(R_SLOT);
  });

  it('the prime survives clearKeys, and revertToGun() clears it (fireable click)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.clearKeys();
    expect(kb.primedSlot).toBe(TORP); // prime is not a held key
    kb.revertToGun();
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('OS auto-repeat on a held slot key does not toggle the prime every repeat', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    press('KeyQ', { repeat: true }); // would revert if repeats counted
    expect(kb.primedSlot).toBe(TORP);
  });

  // PIN FLIPPED (Story 8.5, epic-8 amendment 26). An unfitted slot key used to
  // be SILENT. With seven of the nine slots empty at 0:00, silence reads as a
  // broken key, so the client now denies: the slot's pulse and the denied tone,
  // and NOTHING on the wire (the server's own 'empty-slot' case stays
  // server-internal — a fair client cannot reach it any more).
  it('an UNFITTED weapon key primes nothing and DENIES on the client', () => {
    const denied: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: (slot) => slot >= SLOT_BOOST && slot !== R_SLOT,
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    const prevented = press('KeyR');
    expect(prevented).toBe(true); // still a bound key — default prevented
    expect(kb.primedSlot).toBe(SLOT_GUN); // …nothing primed…
    expect(kb.pendingActivationCount).toBe(0); // …nothing queued…
    expect(denied).toEqual([R_SLOT]); // …but the slot flashes DENIED
  });

  it('a FITTED weapon key never fires the empty-slot denial', () => {
    const denied: number[] = [];
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, onEmptySlotDenied: (s) => denied.push(s) });
    kb.attach();
    press('KeyQ');
    press('KeyE');
    expect(denied).toEqual([]);
  });

  it('THE LOCK WINS SILENTLY over the empty-slot denial (amendment 26)', () => {
    // "Locked must read as LOCKED, never as DENIED" — the start-line lockout is
    // specified feedback-free, so it is checked FIRST and an empty slot pressed
    // against a held trigger produces no pulse and no tone at all.
    const denied: number[] = [];
    let held = true;
    kb = new KeyboardInput({
      isSlotFitted: () => false,
      isCombatLocked: () => held,
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    press('KeyR');
    expect(denied).toEqual([]);
    // The refit modal swallows it the same way…
    kb.detach();
    kb = new KeyboardInput({
      isSlotFitted: () => false,
      isModalOpen: () => true,
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    press('KeyR');
    expect(denied).toEqual([]);
    // …and once the match goes live the very same press DOES deny.
    held = false;
    kb.detach();
    kb = new KeyboardInput({
      isSlotFitted: () => false,
      isCombatLocked: () => held,
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    press('KeyR');
    expect(denied).toEqual([R_SLOT]);
  });

  it('digits NEVER prime a slot (the old digit slot-priming is dead — amendment 3)', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('Digit2');
    press('Digit1');
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.actSeq).toBe(0);
  });
});

describe('KeyboardInput — ability activation (FIFO + capped-press feedback)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  /** The shipped split since Story 8.5: slot 1 (Shift) holds the boost, and it
   *  is the ONLY ability on any hull. */
  const boostAbilitySlot = (slot: number): boolean => slot === BOOST;

  it('an ability press QUEUES; the wire counter advances only on consumeActivation', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    expect(kb.actSeq).toBe(0); // the 0 sentinel before any press
    press('ShiftLeft');
    expect(presses).toEqual([BOOST]);
    expect(kb.pendingActivationCount).toBe(1);
    expect(kb.actSeq).toBe(0);
    kb.consumeActivation(); // one input built → drain one press
    expect(kb.actSeq).toBe(1);
    expect(kb.actSlot).toBe(BOOST);
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.primedSlot).toBe(SLOT_GUN); // NEVER primes
  });

  it('EITHER shift key boosts — left and right are the same slot 1 action', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    expect(press('ShiftLeft')).toBe(true); // bound → prevented
    expect(press('ShiftRight')).toBe(true);
    expect(presses).toEqual([BOOST, BOOST]);
  });

  it('a HELD shift is ONE press — OS auto-repeat never machine-guns the boost', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    press('ShiftLeft');
    press('ShiftLeft', { repeat: true });
    press('ShiftLeft', { repeat: true });
    expect(presses).toEqual([BOOST]); // the whole hold is one tap
    press('ShiftLeft'); // a fresh press edge boosts again
    expect(presses).toEqual([BOOST, BOOST]);
  });

  it('onAbility carries the actSeq the press WILL ride (consumedCount + queue depth)', () => {
    const rides: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbility: (_slot, actSeq) => rides.push(actSeq),
    });
    kb.attach();
    press('ShiftLeft'); // first queued → will ride actSeq 1
    press('ShiftRight'); // second queued behind it → will ride actSeq 2
    expect(rides).toEqual([1, 2]);
  });

  it('PIN HELD: the mine and the buoy PRIME — neither queues an activation', () => {
    // Story 2.8, amendment 45 moved the mine out of the activation FIFO onto the
    // prime path; Story 7-5 wave 2 (R2.7) moved the RADAR BUOY there too. Both
    // prime, and the FIFO stays empty for a hull carrying them. (The speed boost
    // still activates — on Shift, in the sibling tests above.)
    const presses: number[] = [];
    const weaponRow: readonly (EquipmentId | null)[] =
      ['gun', 'speedBoost', 'navalMines', 'radarBuoy', null, null, null, null, null];
    kb = new KeyboardInput({
      isSlotFitted: (slot) => weaponRow[slot] != null,
      isAbilitySlot: (slot) => slotHoldsAbility(weaponRow, slot),
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    press('KeyQ'); // mine — a WEAPON prime
    expect(kb.primedSlot).toBe(Q_SLOT);
    expect(kb.pendingActivationCount).toBe(0);
    press('KeyE'); // radar buoy — a WEAPON prime as of wave 2
    expect(presses).toEqual([]);
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.primedSlot).toBe(E_SLOT);
  });

  it('an activation press never disturbs an existing weapon prime', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, isAbilitySlot: boostAbilitySlot });
    kb.attach();
    press('KeyQ'); // prime the torpedo in Q
    press('ShiftLeft'); // boost activation — queued, independent of the prime
    expect(kb.primedSlot).toBe(TORP);
    kb.consumeActivation();
    expect(kb.actSeq).toBe(1);
  });

  it('a cooling/dead press still queues + fires the callback (the server decides)', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    press('ShiftLeft');
    press('ShiftLeft');
    expect(presses).toEqual([BOOST, BOOST]);
    kb.consumeActivation();
    kb.consumeActivation();
    expect(kb.actSeq).toBe(2);
  });

  it('consumeActivation is a no-op with an empty queue (repeats the counters)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, isAbilitySlot: boostAbilitySlot });
    kb.attach();
    press('ShiftLeft');
    kb.consumeActivation();
    expect(kb.actSeq).toBe(1);
    kb.consumeActivation(); // nothing queued
    expect(kb.actSeq).toBe(1); // unchanged
    expect(kb.actSlot).toBe(BOOST);
  });

  it('the FIFO caps at SLOT_COUNT (9) — the 10th same-window press gets DENIED FEEDBACK', () => {
    // The cap simply follows the slot count, which Story 8.5 moved 4 → 9. It is
    // still only reachable by MASHING: nine presses inside ONE 50ms sample
    // window. Over-cap presses are dropped WITH feedback, never in silence.
    const presses: number[] = [];
    const capped: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbility: (slot) => presses.push(slot),
      onAbilityCapped: (slot) => capped.push(slot),
    });
    kb.attach();
    for (let i = 0; i < 12; i++) press('ShiftLeft'); // 12 presses in one window
    expect(kb.pendingActivationCount).toBe(9); // capped
    expect(presses).toHaveLength(9); // over-cap presses never reach onAbility
    expect(capped).toEqual([BOOST, BOOST, BOOST]); // …but EACH fires the denied hook
  });

  it('clearActivations drops the pending queue but LEAVES the consumed counters monotonic', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, isAbilitySlot: boostAbilitySlot });
    kb.attach();
    press('ShiftLeft');
    kb.consumeActivation(); // actSeq 1
    press('ShiftLeft');
    press('ShiftLeft');
    expect(kb.pendingActivationCount).toBe(2);
    kb.clearActivations(); // death / respawn / reconnect boundary
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.actSeq).toBe(1); // NOT reset — mirrors the server's un-reset lastActSeq
    press('ShiftLeft');
    kb.consumeActivation();
    expect(kb.actSeq).toBe(2);
  });

  it('on an all-weapon row the weapon keys PRIME and actSeq stays 0', () => {
    const weaponRow: readonly (EquipmentId | null)[] =
      ['gun', 'speedBoost', 'broadside', 'starShells', null, null, null, null, null];
    kb = new KeyboardInput({
      isSlotFitted: (slot) => weaponRow[slot] != null,
      isAbilitySlot: (slot) => slotHoldsAbility(weaponRow, slot),
    });
    kb.attach();
    press('KeyE');
    expect(kb.primedSlot).toBe(E_SLOT); // star shells — primes like a weapon
    expect(kb.actSeq).toBe(0); // the sentinel never advances
    expect(kb.actSlot).toBe(0);
  });

  it('FAILS CLOSED without the fitted hook: a bare construction primes NOTHING', () => {
    // The hook is the only source of truth for what is fitted. Absent it, no
    // slot beyond the gun counts as fitted — a future construction site that
    // forgets to wire it gets inert slot keys (and, since Story 8.5, a denial
    // the app may or may not have wired), never the ruled-away "R primes an
    // empty slot" behavior. SHIFT fails closed the same way and stays SILENT:
    // the only hull with an empty slot 1 is a PvE drone, which has no keyboard.
    kb = new KeyboardInput();
    kb.attach();
    for (const code of ['KeyQ', 'KeyE', 'KeyR', 'ShiftLeft', 'ShiftRight']) {
      expect(press(code), code).toBe(true); // bound → still prevented
    }
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.actSeq).toBe(0);
  });
});

describe('KeyboardInput — refit modal keys (TAB / ESC / digits) + suspension', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  it('TAB fires onRefitToggle and is preventDefault-ed (no browser focus cycle)', () => {
    let toggles = 0;
    kb = new KeyboardInput({ onRefitToggle: () => (toggles += 1) });
    kb.attach();
    expect(press('Tab')).toBe(true);
    expect(toggles).toBe(1);
    press('Tab', { repeat: true }); // held TAB never machine-guns the modal
    expect(toggles).toBe(1);
  });

  it('SHIFT+TAB is inert — the browser reverse focus-cycle never toggles the refit modal', () => {
    // STORY 8.5 MADE SHIFT AN ACTION KEY AND THIS PIN STILL HOLDS: the
    // shiftKey+Tab special case is evaluated BEFORE the binding lookup, so the
    // Tab event is prevented and takes no action exactly as it always did. (The
    // preceding ShiftLeft keydown is a separate event and boosts on its own —
    // that is the ruling, not a regression.)
    let toggles = 0;
    const presses: number[] = [];
    kb = new KeyboardInput({
      onRefitToggle: () => (toggles += 1),
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: (slot) => slot === BOOST,
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    expect(press('Tab', { shiftKey: true })).toBe(true); // prevented: focus stays on the canvas
    expect(toggles).toBe(0); // …but NO action
    expect(presses).toEqual([]); // …and Shift+Tab is not a boost either
    press('Tab'); // plain TAB still toggles
    expect(toggles).toBe(1);
  });

  it('other SHIFTed keys keep their normal behavior (shift is not a native-chord modifier)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    expect(press('KeyW', { shiftKey: true })).toBe(true);
    expect(kb.throttle).toBe(0.25);
    press('KeyQ', { shiftKey: true });
    expect(kb.primedSlot).toBe(TORP);
  });

  it('ESC fires onEscape (main.ts closes the topmost surface)', () => {
    let escapes = 0;
    kb = new KeyboardInput({ onEscape: () => (escapes += 1) });
    kb.attach();
    expect(press('Escape')).toBe(true);
    expect(escapes).toBe(1);
  });

  it('digits are refit-or-nothing: NOTHING with the modal closed, a pick while open', () => {
    const picks: number[] = [];
    let open = false;
    kb = new KeyboardInput({ isModalOpen: () => open, onRefitPick: (c) => picks.push(c) });
    kb.attach();
    press('Digit1');
    press('Digit4');
    expect(picks).toEqual([]); // closed → nothing (amendment 3)
    open = true;
    press('Digit1');
    press('Digit3');
    press('Numpad4');
    expect(picks).toEqual([0, 2, 3]); // open → picks (digit meaning at ITS OWN keydown)
  });

  it('digit 5 is refit-or-nothing too: the heal only ever fires INSIDE the modal', () => {
    const picks: number[] = [];
    let open = false;
    kb = new KeyboardInput({ isModalOpen: () => open, onRefitPick: (c) => picks.push(c) });
    kb.attach();
    // Bound (so it is prevented — focus can never escape the canvas) but inert.
    expect(press('Digit5')).toBe(true);
    expect(press('Numpad5')).toBe(true);
    expect(picks).toEqual([]);
    open = true;
    press('Digit5');
    press('Numpad5');
    expect(picks).toEqual([HEAL_CHOICE, HEAL_CHOICE]);
  });

  it('digit 5 fires once per physical press — OS auto-repeat never re-spends', () => {
    const picks: number[] = [];
    kb = new KeyboardInput({ isModalOpen: () => true, onRefitPick: (c) => picks.push(c) });
    kb.attach();
    press('Digit5');
    press('Digit5', { repeat: true });
    expect(picks).toEqual([HEAL_CHOICE]);
  });

  it('slot keys (Q/E/R AND Shift) are SUSPENDED while the modal is open', () => {
    // UX-DR42, verbatim: "Q/E/R/Shift are suspended while the refit window is
    // open" — full combat lockout, feedback-free.
    const pressed: number[] = [];
    let open = true;
    kb = new KeyboardInput({
      isModalOpen: () => open,
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: (slot) => slot === BOOST,
      onAbility: (slot) => pressed.push(slot),
    });
    kb.attach();
    expect(press('KeyQ')).toBe(true); // still prevented (bound key)…
    expect(press('KeyE')).toBe(true);
    expect(press('ShiftLeft')).toBe(true);
    expect(press('ShiftRight')).toBe(true);
    expect(kb.primedSlot).toBe(SLOT_GUN); // …but no prime
    expect(pressed).toEqual([]); // …and no ability queue
    expect(kb.pendingActivationCount).toBe(0);
    open = false; // modal closed → keys live again
    press('KeyQ');
    expect(kb.primedSlot).toBe(Q_SLOT);
    press('ShiftLeft');
    expect(pressed).toEqual([BOOST]);
  });

  it('helm keys stay LIVE while the modal is open (the sim never pauses)', () => {
    kb = new KeyboardInput({ isModalOpen: () => true });
    kb.attach();
    press('KeyW');
    press('KeyD');
    expect(kb.axes()).toEqual({ throttle: 0.25, rudder: 1 });
  });

  it('slot keys AND Shift are SUSPENDED by the non-modal combat lockout (Story 6.1 start line)', () => {
    const pressed: number[] = [];
    let held = true;
    kb = new KeyboardInput({
      isCombatLocked: () => held,
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: (slot) => slot === BOOST,
      onAbility: (slot) => pressed.push(slot),
    });
    kb.attach();
    expect(press('KeyQ')).toBe(true); // still prevented (bound key)…
    expect(press('KeyR')).toBe(true);
    expect(press('ShiftLeft')).toBe(true);
    expect(kb.primedSlot).toBe(SLOT_GUN); // …but no prime
    expect(pressed).toEqual([]); // …and no ability queue — nothing rides an input
    expect(kb.pendingActivationCount).toBe(0);
    held = false; // the match went live → keys live again
    press('KeyQ');
    expect(kb.primedSlot).toBe(Q_SLOT);
    press('ShiftRight');
    expect(pressed).toEqual([BOOST]);
  });

  it('F SURVIVES the combat lockout — the horn is neither movement, weapons nor radar', () => {
    // Epic-6 amendment 8 locks exactly three things and the foghorn is none of
    // them, which is precisely why the start line got its own hook instead of
    // riding isModalOpen (that one DOES suspend F — see the foghorn suite).
    let honks = 0;
    kb = new KeyboardInput({ onFoghorn: () => (honks += 1), isCombatLocked: () => true });
    kb.attach();
    press('KeyF');
    expect(honks).toBe(1);
  });

  it('the helm keys are untouched by the combat lockout (main.ts owns the movement lock)', () => {
    // The dead helm at the start line is helmAxes(), upstream of the wire AND
    // the predictor — this adapter must not grow a second opinion about it.
    kb = new KeyboardInput({ isCombatLocked: () => true });
    kb.attach();
    press('KeyW');
    press('KeyD');
    expect(kb.axes()).toEqual({ throttle: 0.25, rudder: 1 });
  });
});

describe('KeyboardInput — the FOCUSED-OVERLAY rule (Story 2.3)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  /** Every sim hook wired, plus a settings/results overlay that owns the input. */
  function overlayKb(): { kb: KeyboardInput; log: string[] } {
    const log: string[] = [];
    const hooks: KeyboardHooks = {
      isOverlayFocused: () => true,
      isModalOpen: () => true, // the overlay is a suspending surface too
      isSlotFitted: ALL_FITTED,
      onDetent: () => log.push('detent'),
      onRefitToggle: () => log.push('refit'),
      onRefitPick: () => log.push('pick'),
      onZoom: () => log.push('zoom'),
      onMute: () => log.push('mute'),
      onNetDebug: () => log.push('net'),
      onEscape: () => log.push('esc'),
      onConfirm: () => log.push('enter'),
    };
    const k = new KeyboardInput(hooks);
    k.attach();
    return { kb: k, log };
  }

  it('suppresses ALL sim keys — helm INCLUDED, unlike the refit modal', () => {
    const { kb: k, log } = overlayKb();
    kb = k;
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'ShiftLeft', 'ShiftRight', 'Digit1', 'KeyX', 'KeyZ', 'KeyP']) {
      expect(press(code), code).toBe(true); // still preventDefault-ed: focus can't escape
    }
    expect(log).toEqual([]);
    expect(k.throttle).toBe(0); // the helm never moved
    expect(k.primedSlot).toBe(SLOT_GUN);
  });

  it('leaves TAB NATIVE so keyboard focus can reach the overlay controls', () => {
    const { kb: k, log } = overlayKb();
    kb = k;
    // NOT prevented: TAB must traverse focus into the overlay's own buttons.
    expect(press('Tab')).toBe(false);
    expect(press('Tab', { shiftKey: true })).toBe(false);
    expect(log).toEqual([]); // and it certainly must not toggle the refit modal
  });

  it('still routes ESC, ENTER and M — dismiss, confirm, and the audio meta-action', () => {
    const { kb: k, log } = overlayKb();
    kb = k;
    press('Escape');
    press('Enter');
    // M is advertised BY the overlay ("MUTE (M)") and mirrored in its own row —
    // swallowing it would make the overlay lie about its own binding.
    expect(press('KeyM')).toBe(true);
    expect(log).toEqual(['esc', 'enter', 'mute']);
  });

  it('with the overlay CLOSED the same keys work exactly as before', () => {
    const log: string[] = [];
    kb = new KeyboardInput({
      isOverlayFocused: () => false,
      isSlotFitted: ALL_FITTED,
      onDetent: () => log.push('detent'),
      onMute: () => log.push('mute'),
    });
    kb.attach();
    press('KeyW');
    press('KeyM');
    press('KeyQ');
    expect(log).toEqual(['detent', 'mute']);
    expect(kb.throttle).toBe(0.25);
    expect(kb.primedSlot).toBe(TORP);
  });
});

describe('KeyboardInput — M / P / zoom keys (folded into the chokepoint)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  // P IS DEV-ONLY SINCE STORY 7-8 (NFR17), AND THIS SUITE CANNOT SEE THAT.
  // Vitest runs with `import.meta.env.DEV` truthy, so every assertion about
  // `KeyP` below — this one and the preventDefault sweep — describes the DEV
  // build, which is the only build a unit test can observe. The PRODUCTION
  // absence is pinned where it is actually decidable: the client build greps
  // `dist` for the handler's `NETCODE:` banner and fails on a hit.
  it('M fires onMute, P fires onNetDebug — edge-only (P: DEV builds only)', () => {
    let mutes = 0;
    let nets = 0;
    kb = new KeyboardInput({ onMute: () => (mutes += 1), onNetDebug: () => (nets += 1) });
    kb.attach();
    press('KeyM');
    press('KeyM', { repeat: true });
    press('KeyP');
    expect(mutes).toBe(1);
    expect(nets).toBe(1);
  });

  it('X zooms in (+1), Z zooms out (-1); auto-repeat is ALLOWED (hold-to-zoom)', () => {
    const dirs: number[] = [];
    kb = new KeyboardInput({ onZoom: (d) => dirs.push(d) });
    kb.attach();
    press('KeyX');
    press('KeyZ');
    press('KeyZ', { repeat: true }); // held Z keeps zooming out
    expect(dirs).toEqual([1, -1, -1]);
  });
});

describe('KeyboardInput — chokepoint hygiene', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => {
    kb?.detach();
    document.body.replaceChildren(); // drop any focused fixture
  });

  it('preventDefaults EVERY bound key — W/A/S/D, arrows, Q/E/R, Shift, F, Space, digits, TAB, ESC, ENTER, Z/X/M/P', () => {
    kb = new KeyboardInput();
    kb.attach();
    for (const code of [
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyQ', 'KeyE', 'KeyR', 'ShiftLeft', 'ShiftRight', 'KeyF', 'Space', 'Digit1', 'Digit4', 'Numpad2',
      'Tab', 'Escape', 'Enter', 'NumpadEnter', 'KeyZ', 'KeyX', 'KeyM', 'KeyP',
    ]) {
      expect(press(code), code).toBe(true);
    }
  });

  it('Space is fully inert — prevented, zero state change', () => {
    // F LEFT THIS TEST IN STORY 4.5 (amendment 56). It sat here as a pin on the
    // Foghorn RESERVATION since Epic 2; the reservation is now spent, and the
    // pin would be pinning the absence of a shipped feature. Space keeps the
    // bound-inert treatment (prevented so the page cannot scroll, no action).
    const picks: number[] = [];
    kb = new KeyboardInput({ onRefitPick: (c) => picks.push(c), isModalOpen: () => true });
    kb.attach();
    expect(press('Space')).toBe(true);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.throttle).toBe(0);
    expect(picks).toEqual([]);
  });

  // --- F: THE FOGHORN (Story 4.5, amendment 56) ------------------------------
  //
  // The chokepoint's whole job for F is the press EDGE plus the two suspension
  // rules it shares with the slot keys. Alive/spectating/cooldown are main.ts's
  // (hornPressVerdict) — the keyboard reports a press, it does not adjudicate
  // one.

  it('F fires onFoghorn exactly once per physical press — never on auto-repeat', () => {
    let honks = 0;
    kb = new KeyboardInput({ onFoghorn: () => (honks += 1) });
    kb.attach();
    expect(press('KeyF')).toBe(true); // still preventDefault-ed, as it always was
    press('KeyF', { repeat: true }); // OS auto-repeat: a held F is ONE honk
    press('KeyF', { repeat: true });
    expect(honks).toBe(1);
    press('KeyF'); // a fresh press edge honks again
    expect(honks).toBe(2);
  });

  it('F is SUSPENDED while the refit modal is open (the Q/E/R rule, verbatim)', () => {
    let honks = 0;
    kb = new KeyboardInput({ onFoghorn: () => (honks += 1), isModalOpen: () => true });
    kb.attach();
    expect(press('KeyF')).toBe(true); // prevented — focus never escapes the canvas
    expect(honks).toBe(0); // ...but inert: a captain picking a card is not conning
  });

  it('F is SWALLOWED by a focused overlay (settings / results), like every non-ESC key', () => {
    let honks = 0;
    kb = new KeyboardInput({ onFoghorn: () => (honks += 1), isOverlayFocused: () => true });
    kb.attach();
    expect(press('KeyF')).toBe(true);
    expect(honks).toBe(0);
  });

  it('F with no hook wired is harmless (every hook is optional)', () => {
    kb = new KeyboardInput();
    kb.attach();
    expect(() => press('KeyF')).not.toThrow();
  });

  it('unbound keys are left native (no preventDefault)', () => {
    kb = new KeyboardInput();
    kb.attach();
    expect(press('KeyC')).toBe(false);
    expect(press('Backquote')).toBe(false);
    expect(press('ControlLeft')).toBe(false); // CTRL is unbound in the v1 scheme
  });

  it('ENTER fires onConfirm once per press edge (never on auto-repeat)', () => {
    let confirms = 0;
    kb = new KeyboardInput({ onConfirm: () => (confirms += 1) });
    kb.attach();
    press('Enter');
    press('Enter', { repeat: true }); // held ENTER never machine-guns the surface
    expect(confirms).toBe(1);
    press('NumpadEnter');
    expect(confirms).toBe(2);
  });

  it('modifier chords stay native: CTRL/META/ALT + a bound key does nothing and prevents nothing', () => {
    kb = new KeyboardInput();
    kb.attach();
    expect(press('KeyW', { ctrlKey: true })).toBe(false); // ctrl+W (close tab) untouched
    expect(kb.throttle).toBe(0); // and it did not ring the engine up
    expect(press('KeyQ', { metaKey: true })).toBe(false);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(press('Digit1', { altKey: true })).toBe(false);
  });

  it('a focused text input suppresses ALL sim keys (typing "wasd" steers nothing) without preventDefault', () => {
    kb = new KeyboardInput();
    kb.attach();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(textEntryFocused()).toBe(true);
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Tab']) {
      expect(press(code), code).toBe(false); // not prevented — typing must still type
    }
    expect(kb.throttle).toBe(0);
    expect(kb.axes().rudder).toBe(0);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    input.blur();
    press('KeyW'); // guard lifts the moment focus leaves
    expect(kb.throttle).toBe(0.25);
  });

  it('a focused BUTTON suppresses sim keys too (Space/Enter must not double-drive)', () => {
    kb = new KeyboardInput();
    kb.attach();
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    expect(textEntryFocused()).toBe(true);
    expect(press('Space')).toBe(false);
    expect(press('KeyQ')).toBe(false);
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  // --- REGRESSION (Story 2.3 review gate): a focused VOLUME SLIDER ------------
  // The overlay's range inputs are <input>s but not text fields. Treating them
  // as text entry made ESC/Enter dead for as long as one held focus — and, since
  // ranges never blurred, that was forever once you touched a volume.

  it('a focused RANGE slider still routes ESC / Enter / M, and leaves the rest native', () => {
    const log: string[] = [];
    kb = new KeyboardInput({
      isOverlayFocused: () => true,
      onEscape: () => log.push('esc'),
      onConfirm: () => log.push('enter'),
      onMute: () => log.push('mute'),
      onDetent: () => log.push('detent'),
    });
    kb.attach();
    const range = document.createElement('input');
    range.type = 'range';
    document.body.appendChild(range);
    range.focus();
    expect(textEntryFocused()).toBe(false); // NOT a text field

    // The overlay's dismiss/confirm keys still reach the app...
    expect(press('Escape')).toBe(true);
    expect(press('Enter')).toBe(true);
    expect(press('KeyM')).toBe(true);
    expect(log).toEqual(['esc', 'enter', 'mute']);

    // ...while the ARROWS stay NATIVE so the slider can still be nudged (they
    // are the rudder binding, and preventDefault-ing them froze the control).
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW']) {
      expect(press(code), code).toBe(false);
    }
    expect(log).toEqual(['esc', 'enter', 'mute']); // and steer nothing
    expect(kb.throttle).toBe(0);
    range.remove();
  });

  it('a focused overlay leaves TAB native (focus can reach the overlay controls)', () => {
    const log: string[] = [];
    kb = new KeyboardInput({ isOverlayFocused: () => true, onRefitToggle: () => log.push('refit') });
    kb.attach();
    expect(press('Tab')).toBe(false);
    expect(log).toEqual([]);
    // With no overlay up, TAB is the refit toggle and IS prevented as ever.
    const other = new KeyboardInput({ isOverlayFocused: () => false, onRefitToggle: () => log.push('refit') });
    kb.detach();
    kb = other;
    other.attach();
    expect(press('Tab')).toBe(true);
    expect(log).toEqual(['refit']);
  });

  it('the HELM reads dead while a focused overlay is up, even with a rudder key HELD', () => {
    // The suppression is keydown-only and axes() reads the LATCHED key set, so a
    // rudder key held when the overlay opened kept steering the never-paused ship.
    let overlay = false;
    kb = new KeyboardInput({ isOverlayFocused: () => overlay });
    kb.attach();
    press('KeyD');
    expect(kb.axes().rudder).toBe(1);
    press('KeyW'); // an engine order, set before the overlay opened
    expect(kb.axes().throttle).toBe(0.25);
    overlay = true;
    expect(kb.axes().rudder).toBe(0);
    expect(kb.axes().throttle).toBe(0.25); // the ORDER survives — it is not a held key
    // clearKeys (what main.ts calls on the open edge) makes it stick.
    kb.clearKeys();
    overlay = false;
    expect(kb.axes().rudder).toBe(0);
  });

  it('textEntryFocused: false for body focus, true for textarea/select', () => {
    // (contentEditable is covered by the isContentEditable branch in source;
    // jsdom never implements isContentEditable, so it is not assertable here.)
    expect(textEntryFocused()).toBe(false); // body
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    expect(textEntryFocused()).toBe(true);
    ta.remove();
    const sel = document.createElement('select');
    document.body.appendChild(sel);
    sel.focus();
    expect(textEntryFocused()).toBe(true);
  });
});

// --- Story 2.2: slotAction — the key-equivalent entry hotbar CLICKS reuse ---
// Amendment 11: a click on a slot IS its key. Same suspension, same fail-closed
// fitted check, same FIFO (cap feedback included) — plus the one slot no key
// addresses: the keyless gun.

describe('KeyboardInput.slotAction — hotbar clicks reuse the EXACT key semantics', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  const boostAbilitySlot = (slot: number): boolean => slot === BOOST;

  it('a weapon slot toggles the prime, exactly like its key', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.slotAction(TORP);
    expect(kb.primedSlot).toBe(TORP);
    kb.slotAction(TORP); // same slot again reverts to the gun
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('the GUN slot (which no key addresses) selects the gun', () => {
    kb = new KeyboardInput({ isSlotFitted: (slot) => slot <= R_SLOT });
    kb.slotAction(TORP);
    expect(kb.primedSlot).toBe(TORP);
    kb.slotAction(SLOT_GUN);
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('an ability slot activates through the SAME FIFO (never primes)', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbility: (slot) => presses.push(slot),
    });
    kb.slotAction(BOOST);
    expect(presses).toEqual([BOOST]);
    expect(kb.pendingActivationCount).toBe(1);
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('a press against the FULL queue is dropped WITH the capped feedback (never silence)', () => {
    const capped: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      onAbilityCapped: (slot) => capped.push(slot),
    });
    for (let i = 0; i < 10; i++) kb.slotAction(BOOST); // SLOT_COUNT (9) fit, the 10th is capped
    expect(kb.pendingActivationCount).toBe(9);
    expect(capped).toEqual([BOOST]);
  });

  it('is SUSPENDED while the refit modal is open (clicks are dead, like the keys)', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: boostAbilitySlot,
      isModalOpen: () => true,
      onAbility: (slot) => presses.push(slot),
    });
    kb.slotAction(TORP);
    kb.slotAction(BOOST);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(presses).toEqual([]);
  });

  it('DENIES on an unfitted slot, and FAILS CLOSED with no fitted hook wired', () => {
    // A click on a slot IS its key (amendment 11), so Story 8.5's client-side
    // empty denial reaches it the same way on the WEAPON row. The BELT rows
    // (5-8) are empty for all of this story and their digits are still
    // refit-only (amendment 27), so a belt CLICK is silent too (Eric
    // 2026-09-16, amendment 30) — key and click on one row behave the same.
    // Nothing is primed and nothing is sent either way.
    const denied: number[] = [];
    const fitted = (slot: number): boolean => ALL_FITTED(slot) && slot !== R_SLOT;
    kb = new KeyboardInput({ isSlotFitted: fitted, onEmptySlotDenied: (s) => denied.push(s) });
    kb.slotAction(R_SLOT); // an empty weapon slot
    kb.slotAction(8); // an empty BELT slot — silent until 8.7
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(denied).toEqual([R_SLOT]);
    const bare = new KeyboardInput();
    bare.slotAction(TORP);
    expect(bare.primedSlot).toBe(SLOT_GUN);
  });
});

// --- Story 8.5, ruling 9 / UX-DR42: the prime reverts on RELEASE, not press ---
//
// main.ts still DECIDES at pointerdown (shouldConsumePrime, where the fire input
// and its D1 fire-time stamp are built) but now only ARMS the revert; the
// matching pointerup pays it. A held trigger therefore keeps its prime for the
// whole hold — which is what Story 8.14's machine gun is built on — and any
// prime change in between cancels the debt, because the key wins.

describe('KeyboardInput — the release-deferred prime revert (UX-DR42)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  it('arming does NOT revert: the prime survives the pointerdown and dies on the release', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyE');
    expect(kb.primedSlot).toBe(E_SLOT);
    kb.armReleaseRevert(); // the pointerdown predicted FIREABLE
    expect(kb.primedSlot).toBe(E_SLOT); // …and the prime is STILL showing
    expect(kb.releaseRevertPending).toBe(true);
    kb.consumeReleaseRevert(); // the matching pointerup
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.releaseRevertPending).toBe(false);
  });

  it('A KEY PRESSED MID-HOLD WINS: the switched prime survives the release', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.armReleaseRevert(); // pointerdown on the Q weapon
    press('KeyE'); // …switched mid-hold
    expect(kb.releaseRevertPending).toBe(false); // the debt is cancelled
    kb.consumeReleaseRevert(); // pointerup
    expect(kb.primedSlot).toBe(E_SLOT); // still E — the key won
  });

  it('a hotbar CLICK mid-hold cancels it too (clicks are keys — amendment 11)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.armReleaseRevert();
    kb.slotAction(R_SLOT);
    kb.consumeReleaseRevert();
    expect(kb.primedSlot).toBe(R_SLOT);
  });

  it('a release with nothing armed is a no-op — a DENIED click keeps its prime', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.consumeReleaseRevert(); // the denied click armed nothing
    expect(kb.primedSlot).toBe(TORP);
  });

  it('arming is idempotent, and one release pays at most one debt', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.armReleaseRevert();
    kb.armReleaseRevert();
    kb.consumeReleaseRevert();
    expect(kb.primedSlot).toBe(SLOT_GUN);
    press('KeyE'); // a fresh prime, with no stale debt behind it
    kb.consumeReleaseRevert();
    expect(kb.primedSlot).toBe(E_SLOT);
  });

  it('revertToGun (the hard boundaries) clears the debt as well as the prime', () => {
    // The sinking window's hygiene and the room's resetPrime still revert
    // outright: those end a LIFE, not a trigger pull, and must not leave a debt
    // behind to fire into the next one.
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.armReleaseRevert();
    kb.revertToGun();
    expect(kb.releaseRevertPending).toBe(false);
    press('KeyE');
    kb.consumeReleaseRevert();
    expect(kb.primedSlot).toBe(E_SLOT);
  });
});

// --- the hook's ONLY consumer: main.ts's feedback wiring ---------------------
//
// `onEmptySlotDenied` is feedback and nothing else — no wire, no state — so a
// chokepoint that fires it into a hook nobody wired would pass every behavioural
// test above and be silently dead in the game. main.ts is the composition root
// and cannot be instantiated under jsdom, but WHICH cue it routes the hook to is
// decidable from the source text, which is the idiom this client already uses
// for facts that only exist at the wiring seam (ordnanceMasksAreServerOnly,
// noDrawPileCounter).

describe('main.ts routes the empty-slot denial to the SHIPPED denied grammar', () => {
  const MAIN_TS = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../main.ts'),
    'utf8',
  );

  it('wires the hook at all — the pulse and the tone have a consumer', () => {
    expect(MAIN_TS).toContain('onEmptySlotDenied:');
  });

  it('reuses the existing per-slot denied flash + budgeted tone, inventing nothing', () => {
    // amendment 26: "the slot flashes its denied pulse and the denied tone
    // plays". Both come from `flashSlotDenied`, the helper the FIFO-full drop
    // already used — an empty Q and a cooling Q are the same sentence to the
    // player, and a second mark for it would be a second thing to learn.
    const hook = MAIN_TS.slice(MAIN_TS.indexOf('onEmptySlotDenied:'));
    expect(hook.slice(0, 200)).toContain('flashSlotDenied(g, slot)');
    const helper = MAIN_TS.slice(MAIN_TS.indexOf('function flashSlotDenied('));
    expect(helper.slice(0, 400)).toContain('abilityDeniedPress[slot] = true');
    expect(helper.slice(0, 400)).toContain('playDenied(g)');
    // …behind the SAME no-twin guard every other client-side denial carries: a
    // tone with no hotbar to flash into is a cue with no twin.
    expect(helper.slice(0, 400)).toContain('deniedFeedbackHasNoTwin(');
  });

  it('sends NOTHING — the denial never reaches the wire (amendment 26)', () => {
    // CLIENT-ONLY BY RULING. No input is sampled, no sequence counter moves and
    // no dedup key is marked (there is no server echo this could ever be
    // deduped against — the server's own empty-slot case is unreachable to a
    // fair client, which is why no DenialReason was added to the wire).
    const hook = MAIN_TS.slice(MAIN_TS.indexOf('onEmptySlotDenied:'));
    const body = hook.slice(0, 200);
    for (const forbidden of ['sampler', 'send', 'markPredicted', 'actSeq', 'fireSeq']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });
});
