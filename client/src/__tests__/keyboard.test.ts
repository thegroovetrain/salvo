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
//     armReleaseRevert / consumeReleaseRevert, and any prime change clears it.
//
// STORY 8.7 GAVE THE DIGITS THEIR SECOND MEANING (rulings 7-8). Amendments 27
// ("1-4 stay refit-only") and 30 ("a belt press is silent") are RETIRED here,
// and their coverage is not deleted — each becomes the TWO-MEANING pin:
//   • `1`-`4` mean a refit PICK while the window is open and a BELT slot
//     (CONSUMABLE_SLOTS) while it is closed, decided at the keydown itself;
//   • `5` is UNBOUND since Story 8.8 deleted the DAMAGE CONTROL rail it used
//     to spend a level on — it picks nothing, reaches no belt square (the belt
//     has four, not five), and is not even preventDefault-ed;
//   • a digit inside the CLOSE GRACE is inert (still prevented): the player who
//     spent their last level on `1` is still holding the key when the window
//     goes away, and that key must not fire the belt;
//   • an EMPTY belt slot now DENIES on the client exactly as an empty weapon
//     slot does (amendment 26's grammar, extended to the belt row);
//   • ability-vs-prime on a belt slot comes from `isWeaponItem` — a consumable
//     that is not `isWeapon` activates, and the decoy shape primes like Q/E/R.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSUMABLE_SLOTS,
  SLOT_BOOST,
  SLOT_GUN,
  WEAPON_SLOTS,
  type OwnShip,
  type SlotItemId,
} from '@salvo/shared';
import {
  rudderFrom,
  panAxesFrom,
  nextPrimedSlot,
  refitCloseStamp,
  refitGraceActive,
  slotHoldsAbility,
  textEntryFocused,
  BELT_KEY_CODES,
  BOOST_KEY_CODES,
  SLOT_KEY_CODES,
  REFIT_DIGIT_CODES,
  KeyboardInput,
  type KeyboardHooks,
} from '../input/keyboard.js';
import { UpgradeMenu, offerView, type OfferView } from '../ui/upgradeMenu.js';
import { CLIENT_CONFIG } from '../config.js';

/** The three weapon slots by their keys — Q, E, R (slots 2, 3, 4). */
const [Q_SLOT, E_SLOT, R_SLOT] = WEAPON_SLOTS;
/** A Torpedo Boat's seeded torpedo lands in the FIRST empty weapon slot: Q. */
const TORP = Q_SLOT;
/** The boost's slot — slot 1 on every captain hull (amendment 23). */
const BOOST = SLOT_BOOST;
/** The four BELT slots, in digit order: `1` addresses the first, `4` the last. */
const [BELT_1, BELT_2, , BELT_4] = CONSUMABLE_SLOTS;

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

  // THE SECOND MEANING (Story 8.7, ruling 7): the same four keys, read against
  // a CLOSED window, address the four BELT slots — in the shared tuple's order,
  // never re-typed as literals, so a re-cut of the slot grammar moves the keys
  // with it (the SLOT_KEY_CODES rule, verbatim).
  it('digits 1–4 ALSO map to the four BELT slots (the shared CONSUMABLE_SLOTS order)', () => {
    expect(BELT_KEY_CODES.Digit1).toBe(CONSUMABLE_SLOTS[0]);
    expect(BELT_KEY_CODES.Digit2).toBe(CONSUMABLE_SLOTS[1]);
    expect(BELT_KEY_CODES.Digit3).toBe(CONSUMABLE_SLOTS[2]);
    expect(BELT_KEY_CODES.Digit4).toBe(CONSUMABLE_SLOTS[3]);
    expect(BELT_KEY_CODES.Numpad1).toBe(CONSUMABLE_SLOTS[0]);
    expect(BELT_KEY_CODES.Numpad4).toBe(CONSUMABLE_SLOTS[3]);
  });

  it('digit 5 has NO belt meaning — the belt is four squares, not five', () => {
    expect(BELT_KEY_CODES.Digit5).toBeUndefined();
    expect(BELT_KEY_CODES.Numpad5).toBeUndefined();
    // …and every belt code is a bound refit code too: the two tables address the
    // SAME physical keys, which is the whole point of the grace between them.
    for (const code of Object.keys(BELT_KEY_CODES)) {
      expect(REFIT_DIGIT_CODES[code], code).toBeGreaterThanOrEqual(0);
    }
  });

  // STORY 8.8 UNBOUND DIGIT 5 ENTIRELY. Cycle 46 gave it the DAMAGE CONTROL
  // rail through a reserved NEGATIVE wire sentinel (HEAL_CHOICE, -1); the rail
  // and the sentinel are both deleted — healing is a card you stock and fire
  // from the belt — so `5` is in NEITHER table, is not preventDefault-ed, and
  // EVERY choice on the wire is a non-negative offer index.
  it('digit 5 is UNBOUND — it is in no digit table, and no choice is negative', () => {
    expect(REFIT_DIGIT_CODES.Digit5).toBeUndefined();
    expect(REFIT_DIGIT_CODES.Numpad5).toBeUndefined();
    for (const [code, choice] of Object.entries(REFIT_DIGIT_CODES)) {
      expect(choice, code).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(REFIT_DIGIT_CODES)).toHaveLength(8); // 1-4, top row + numpad
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
  const nine = (...weapons: (string | null)[]): readonly (SlotItemId | null)[] =>
    ['gun', 'speedBoost', ...weapons, null, null, null, null, null].slice(0, 9) as (SlotItemId | null)[];
  /** The same spine with the BELT stocked: slot content is a `SlotItemId`, so a
   *  belt square holds a CONSUMABLE id and the split must still answer. */
  const withBelt = (...belt: (SlotItemId | null)[]): readonly (SlotItemId | null)[] =>
    ['gun', 'speedBoost', null, null, null, ...belt, null, null, null].slice(0, 9) as (SlotItemId | null)[];

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

  // STORY 8.7 (ruling 7): the split now reads the SHARED `isWeaponItem`, the one
  // predicate both dispatch channels call, so it answers over CONSUMABLE ids as
  // well as equipment ones. A consumable that is not `isWeapon` ACTIVATES off
  // the `1`-`4` rail; the decoy shape (the one click-placed consumable) PRIMES,
  // exactly as the mine and the buoy do on the weapon row.
  it('answers over CONSUMABLE ids too: an instant stack ACTIVATES, the decoy shape PRIMES', () => {
    expect(slotHoldsAbility(withBelt('hullRepair'), BELT_1)).toBe(true);
    expect(slotHoldsAbility(withBelt('smokeScreen'), BELT_1)).toBe(true);
    expect(slotHoldsAbility(withBelt('chaff'), BELT_1)).toBe(true);
    expect(slotHoldsAbility(withBelt('shieldBlock'), BELT_1)).toBe(true);
    expect(slotHoldsAbility(withBelt('decoyBuoy'), BELT_1)).toBe(false); // aimed → primes
    expect(slotHoldsAbility(withBelt(null, 'hullRepair'), BELT_2)).toBe(true);
    expect(slotHoldsAbility(withBelt('hullRepair'), BELT_2)).toBe(false); // that square is empty
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

  it('digits NEVER address the WEAPON row (the old digit slot-priming is dead — amendment 3)', () => {
    // Amendment 3 killed "digit = weapon slot" for good; Story 8.7 gave the
    // digits the BELT, which is a different row. A bare construction (no fitted
    // hook → no fitted slots at all) therefore still primes NOTHING: the pin is
    // that Q/E/R's slots are unreachable from a digit, not that a digit is inert.
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('Digit2');
    press('Digit1');
    expect(kb.primedSlot).toBe(SLOT_GUN); // slots 2-4 are fitted and STILL untouched
    expect(kb.actSeq).toBe(0);
    expect(kb.pendingActivationCount).toBe(0);
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
    const weaponRow: readonly (SlotItemId | null)[] =
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
    const weaponRow: readonly (SlotItemId | null)[] =
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

  // THE TWO MEANINGS, ON ONE KEY (Story 8.7, ruling 7 — this pin replaces the
  // amendment-27 "digits are refit-only" one, which is retired with the belt).
  // The meaning is decided AT THE KEYDOWN against the window's state: open, a
  // digit is a card pick and can never reach the belt; closed, it is that belt
  // square's press and can never reach the offer.
  it('digits mean a PICK while the window is open and a BELT press while it is closed', () => {
    const picks: number[] = [];
    const fired: number[] = [];
    let open = false;
    kb = new KeyboardInput({
      isModalOpen: () => open,
      onRefitPick: (c) => picks.push(c),
      isSlotFitted: (slot) => (CONSUMABLE_SLOTS as readonly number[]).includes(slot),
      isAbilitySlot: () => true,
      onAbility: (slot) => fired.push(slot),
    });
    kb.attach();
    open = true;
    press('Digit1');
    press('Digit3');
    press('Numpad4');
    expect(picks).toEqual([0, 2, 3]); // open → picks…
    expect(fired).toEqual([]); // …and the belt is NEVER reached while it is open
    open = false;
    press('Digit1');
    press('Numpad4');
    expect(fired).toEqual([BELT_1, BELT_4]); // closed → the belt squares, in key order
    expect(picks).toEqual([0, 2, 3]); // …and nothing new was picked
  });

  it('digit 5 is INERT and NOT EVEN BOUND, either side of the modal (Story 8.8)', () => {
    const picks: number[] = [];
    let open = false;
    kb = new KeyboardInput({ isModalOpen: () => open, onRefitPick: (c) => picks.push(c) });
    kb.attach();
    // Not prevented any more: the chokepoint has no handler for it at all, so
    // the browser keeps the key — there is nothing left for `5` to escape into.
    expect(press('Digit5')).toBe(false);
    expect(press('Numpad5')).toBe(false);
    expect(picks).toEqual([]);
    open = true;
    expect(press('Digit5')).toBe(false);
    expect(press('Numpad5')).toBe(false);
    expect(picks).toEqual([]);
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

// --- Story 8.7, rulings 7-8: THE BELT ROW AND THE CLOSE GRACE ----------------
//
// The belt (slots 5-8) became reachable in Story 8.7: `1`-`4` fire it with the
// refit window closed, and a hotbar click on a belt square is the same press
// (both route through `slotAction`, so key and click cannot drift). Amendment
// 30's "a belt press is silent" is retired — an empty belt square now DENIES on
// the client exactly as an empty weapon slot does (amendment 26's grammar,
// completed), with nothing on the wire either way.
//
// Between the two meanings sits the GRACE: for CLIENT_CONFIG.refit.closeGraceMs
// after the window closes by ANY path, a digit is swallowed. main.ts owns the
// stamp (it watches the window's visibility); the chokepoint only asks.

describe('KeyboardInput — the BELT row (digits 1-4 with the window closed)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  /** The belt fitted, the weapon row empty — the shape this suite is about. */
  const BELT_FITTED = (slot: number): boolean => (CONSUMABLE_SLOTS as readonly number[]).includes(slot);

  it('an INSTANT stack ACTIVATES through the same FIFO the boost uses', () => {
    const fired: [number, number][] = [];
    kb = new KeyboardInput({
      isSlotFitted: BELT_FITTED,
      isAbilitySlot: () => true, // a consumable with isWeaponItem false
      onAbility: (slot, seq) => fired.push([slot, seq]),
    });
    kb.attach();
    press('Digit1');
    press('Digit2');
    expect(fired).toEqual([[BELT_1, 1], [BELT_2, 2]]);
    expect(kb.pendingActivationCount).toBe(2);
    expect(kb.primedSlot).toBe(SLOT_GUN); // an activation never primes
  });

  it('a DECOY-SHAPED stack PRIMES, toggling exactly like Q/E/R', () => {
    // The one click-placed consumable (CONSUMABLE_IS_WEAPON.decoyBuoy) takes the
    // weapon path: the digit primes its square, the same digit again reverts to
    // the gun, and nothing queues on the ability channel.
    const fired: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: BELT_FITTED,
      isAbilitySlot: () => false,
      onAbility: (slot) => fired.push(slot),
    });
    kb.attach();
    press('Digit4');
    expect(kb.primedSlot).toBe(BELT_4);
    press('Digit4');
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(fired).toEqual([]);
    expect(kb.actSeq).toBe(0);
  });

  it('a belt press CLEARS an owed release-revert — the key wins there too', () => {
    kb = new KeyboardInput({ isSlotFitted: (slot) => slot <= R_SLOT || BELT_FITTED(slot) });
    kb.attach();
    press('KeyQ');
    kb.armReleaseRevert(1);
    press('Digit4'); // a belt prime mid-hold
    expect(kb.releaseRevertPending).toBe(false);
    expect(kb.primedSlot).toBe(BELT_4);
  });

  it('an EMPTY belt square DENIES on the client — amendment 30 is retired', () => {
    // PIN FLIPPED. The belt used to be silent because nothing could enter it;
    // now that a card can stock it, an empty square is exactly the "that key did
    // nothing just now" case amendment 26 gave the weapon row — same pulse, same
    // tone, still NOTHING on the wire.
    const denied: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: () => false,
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    expect(press('Digit1')).toBe(true); // bound → prevented
    press('Numpad4');
    expect(denied).toEqual([BELT_1, BELT_4]);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.actSeq).toBe(0);
  });

  // --- STORY 8.8: THE BLOCKED PRESS ON A *STOCKED* SQUARE ---------------------
  //
  // amendment 26's precedent, one square along. A HULL REPAIR stack on a hull
  // that is already full (or already sinking) is a press the server will refuse
  // with `blocked`, and the client knows both facts — so it refuses first, in
  // the same grammar, and sends nothing. The PREDICATE lives in
  // `beltPressDenied` (see refitFailOpen.test.ts); this is the chokepoint half.
  it('a STOCKED square the client knows is BLOCKED denies without sending', () => {
    const denied: number[] = [];
    const fired: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: BELT_FITTED,
      isAbilitySlot: () => true,
      isPressDenied: (slot) => slot === BELT_1,
      onPressDenied: (slot) => denied.push(slot),
      onAbility: (slot) => fired.push(slot),
    });
    kb.attach();
    press('Digit1'); // the blocked square
    press('Digit2'); // its neighbour, which is not
    expect(denied).toEqual([BELT_1]);
    expect(fired).toEqual([BELT_2]);
    expect(kb.pendingActivationCount).toBe(1); // only the neighbour queued
    expect(kb.actSeq).toBe(0); // nothing consumed onto the wire by the refusal
  });

  it('a hotbar CLICK on a blocked square is the SAME refusal as its digit', () => {
    const denied: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: BELT_FITTED,
      isAbilitySlot: () => true,
      isPressDenied: () => true,
      onPressDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    kb.slotAction(BELT_4); // amendment 11's law: a click is this very entry
    expect(denied).toEqual([BELT_4]);
  });

  it('an EMPTY square reads as EMPTY, never as blocked — the order is fixed', () => {
    const empty: number[] = [];
    const blocked: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: () => false,
      isPressDenied: () => true, // would refuse too, but never gets the chance
      onEmptySlotDenied: (slot) => empty.push(slot),
      onPressDenied: (slot) => blocked.push(slot),
    });
    kb.attach();
    press('Digit1');
    expect(empty).toEqual([BELT_1]);
    expect(blocked).toEqual([]);
  });

  it('the LOCK still wins SILENTLY over the blocked press too', () => {
    const denied: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: BELT_FITTED,
      isCombatLocked: () => true,
      isPressDenied: () => true,
      onPressDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    press('Digit1');
    expect(denied).toEqual([]); // locked must read as LOCKED, never as denied
  });

  it('FAILS OPEN with no isPressDenied hook — every press goes through', () => {
    const fired: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: BELT_FITTED,
      isAbilitySlot: () => true,
      onAbility: (slot) => fired.push(slot),
    });
    kb.attach();
    press('Digit1');
    expect(fired).toEqual([BELT_1]);
  });

  it('the LOCK and the OPEN WINDOW still win silently over the belt denial', () => {
    const denied: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: () => false,
      isCombatLocked: () => true,
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    press('Digit1');
    expect(denied).toEqual([]);
    kb.detach();
    // …and with the window OPEN the digit is a PICK, so the belt is not even
    // consulted: no denial for an empty square the player never addressed.
    const picks: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: () => false,
      isModalOpen: () => true,
      onRefitPick: (c) => picks.push(c),
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    press('Digit1');
    expect(denied).toEqual([]);
    expect(picks).toEqual([0]);
  });

  it('a HELD digit is ONE press — OS auto-repeat never machine-guns the belt', () => {
    const fired: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: BELT_FITTED,
      isAbilitySlot: () => true,
      onAbility: (slot) => fired.push(slot),
    });
    kb.attach();
    press('Digit1');
    press('Digit1', { repeat: true });
    press('Digit1', { repeat: true });
    expect(fired).toEqual([BELT_1]);
  });

  it('digit 5 stays INERT with the window closed (the belt has no fifth square)', () => {
    const denied: number[] = [];
    const picks: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: () => true,
      isAbilitySlot: () => true,
      onRefitPick: (c) => picks.push(c),
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    expect(press('Digit5')).toBe(false); // unbound since Story 8.8…
    expect(press('Numpad5')).toBe(false);
    expect(picks).toEqual([]); // …and inert: no pick…
    expect(denied).toEqual([]); // …no denial…
    expect(kb.pendingActivationCount).toBe(0); // …and no belt press
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('a hotbar CLICK on a belt square is the SAME press as its digit', () => {
    // amendment 11's law, now true of the belt row as well: `handleHotbarPress`
    // routes a belt click through `slotAction`, which is the very entry the
    // digit uses — so the two cannot drift.
    const byKey: number[] = [];
    const byClick: number[] = [];
    kb = new KeyboardInput({ isSlotFitted: BELT_FITTED, isAbilitySlot: () => true, onAbility: (s) => byKey.push(s) });
    kb.attach();
    press('Digit2');
    kb.detach();
    kb = new KeyboardInput({ isSlotFitted: BELT_FITTED, isAbilitySlot: () => true, onAbility: (s) => byClick.push(s) });
    kb.slotAction(BELT_2);
    expect(byClick).toEqual(byKey);
  });
});

describe('the refit CLOSE GRACE (ruling 8) — the digits\' dead zone', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  const GRACE = CLIENT_CONFIG.refit.closeGraceMs;

  it('is 400 ms, matching the results.keyGraceMs precedent', () => {
    expect(GRACE).toBe(400);
    expect(GRACE).toBe(CLIENT_CONFIG.results.keyGraceMs);
  });

  // THE EDGE IS `<`, exactly like resultsKeysArmed's `>=`: the grace is the
  // HALF-OPEN interval [closedAt, closedAt + 400). At 400 ms on the nose the
  // digit fires — a grace that included its own end would be unpinnable by a
  // frame clock that lands on it.
  it('is live for 150 ms and dead at the 400 ms edge itself', () => {
    expect(refitGraceActive(1000, 1000, GRACE)).toBe(true); // the close instant
    expect(refitGraceActive(1150, 1000, GRACE)).toBe(true); // 150 ms after
    expect(refitGraceActive(1399.9, 1000, GRACE)).toBe(true);
    expect(refitGraceActive(1400, 1000, GRACE)).toBe(false); // the edge FIRES
    expect(refitGraceActive(1401, 1000, GRACE)).toBe(false);
  });

  it('is dead before the window has EVER closed (the -Infinity seed)', () => {
    expect(refitGraceActive(0, -Infinity, GRACE)).toBe(false);
    expect(refitGraceActive(1e9, -Infinity, GRACE)).toBe(false);
  });

  it('swallows a belt digit inside it: nothing fired, nothing primed, still prevented', () => {
    const fired: number[] = [];
    const denied: number[] = [];
    let grace = true;
    kb = new KeyboardInput({
      isRefitGrace: () => grace,
      isSlotFitted: () => true,
      isAbilitySlot: () => true,
      onAbility: (slot) => fired.push(slot),
      onEmptySlotDenied: (slot) => denied.push(slot),
    });
    kb.attach();
    expect(press('Digit1')).toBe(true); // prevented — focus can never escape
    expect(fired).toEqual([]);
    expect(denied).toEqual([]); // not even a denial: the key did not act at all
    expect(kb.pendingActivationCount).toBe(0);
    grace = false;
    press('Digit1');
    expect(fired).toEqual([BELT_1]); // …and the very same key acts once it lapses
  });

  it('never swallows a PICK — the grace only exists on the closed side', () => {
    const picks: number[] = [];
    kb = new KeyboardInput({
      isRefitGrace: () => true,
      isModalOpen: () => true,
      onRefitPick: (c) => picks.push(c),
    });
    kb.attach();
    press('Digit1');
    press('Digit5'); // unbound: it can neither pick nor be swallowed
    expect(picks).toEqual([0]);
  });

  it('leaves digit 5 inert either side of it', () => {
    const picks: number[] = [];
    const denied: number[] = [];
    for (const grace of [true, false]) {
      kb?.detach();
      kb = new KeyboardInput({
        isRefitGrace: () => grace,
        isSlotFitted: () => true,
        onRefitPick: (c) => picks.push(c),
        onEmptySlotDenied: (s) => denied.push(s),
      });
      kb.attach();
      expect(press('Digit5')).toBe(false);
    }
    expect(picks).toEqual([]);
    expect(denied).toEqual([]);
  });

  it('FAILS OPEN with no hook wired — a construction gap must not kill the belt', () => {
    // The opposite of the fitted hook's fail-closed rule, and deliberately: a
    // missing grace hook means "no window has ever closed here", which is the
    // truth in every test harness that drives the belt directly.
    const fired: number[] = [];
    kb = new KeyboardInput({ isSlotFitted: () => true, isAbilitySlot: () => true, onAbility: (s) => fired.push(s) });
    kb.attach();
    press('Digit1');
    expect(fired).toEqual([BELT_1]);
  });
});

// The stamp's other half: WHEN the grace starts. main.ts holds the two numbers
// (the previous frame's visibility and `refitClosedAt`); the RULE is this pure
// function, driven here through the REAL refit band on every close path there
// is — TAB (toggle), ESC (hide) and the last spend (update(null)).
describe('refitCloseStamp — the close edge, over the real refit band', () => {
  beforeEach(() => document.body.replaceChildren());

  const you = (): OwnShip => ({
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: 'torpedoBoat', pts: 1,
    offer: ['radarSweep', 'armor', 'deckGunBarrel', 'navalMines'],
    boostUntil: 0, cards: [], lvl: 0, xp: 0, repairHp: 0,
  });
  const view = (): OfferView => offerView(you(), false, false, false) as OfferView;

  /** One render frame of main.ts's watcher, in its exact shape. */
  function frameRunner(menu: UpgradeMenu) {
    let prevOpen = false;
    let closedAt = -Infinity;
    let opens = 0;
    return {
      frame(nowMs: number): void {
        const open = menu.visible;
        if (open && !prevOpen) opens += 1; // the false→true edge ends held streams
        closedAt = refitCloseStamp(prevOpen, open, nowMs, closedAt);
        prevOpen = open;
      },
      get closedAt(): number { return closedAt; },
      get opens(): number { return opens; },
    };
  }

  it('stamps on a TAB close, and not on the open', () => {
    const menu = new UpgradeMenu(() => {});
    const w = frameRunner(menu);
    w.frame(100);
    expect(w.closedAt).toBe(-Infinity);
    menu.toggle(view()); // TAB — open
    w.frame(200);
    expect(w.closedAt).toBe(-Infinity); // an OPEN never stamps
    expect(w.opens).toBe(1);
    menu.toggle(view()); // TAB again — close
    w.frame(300);
    expect(w.closedAt).toBe(300);
    w.frame(400); // a steady closed frame must not re-stamp
    expect(w.closedAt).toBe(300);
  });

  it('stamps on an ESC close (the band\'s hide())', () => {
    const menu = new UpgradeMenu(() => {});
    const w = frameRunner(menu);
    menu.toggle(view());
    w.frame(10);
    menu.hide(); // ESC — main.ts's handleEscape path
    w.frame(20);
    expect(w.closedAt).toBe(20);
  });

  it('stamps on the LAST SPEND close (the per-frame update(null) force-hide)', () => {
    const menu = new UpgradeMenu(() => {});
    const w = frameRunner(menu);
    menu.toggle(view());
    w.frame(10);
    expect(menu.visible).toBe(true);
    menu.update(null); // the bank emptied (or spectate) — currentOfferView null
    expect(menu.visible).toBe(false);
    w.frame(30);
    expect(w.closedAt).toBe(30);
  });

  it('re-stamps on every subsequent close (the grace is per-close, not once)', () => {
    const menu = new UpgradeMenu(() => {});
    const w = frameRunner(menu);
    menu.toggle(view());
    w.frame(10);
    menu.hide();
    w.frame(20);
    menu.toggle(view());
    w.frame(30);
    expect(w.opens).toBe(2);
    menu.hide();
    w.frame(44);
    expect(w.closedAt).toBe(44);
  });
});

// THE EDGE IS OBSERVED AT THE EVENT, NOT AT THE NEXT FRAME (review patch P3).
//
// TAB and ESC hide the window SYNCHRONOUSLY inside a keydown handler, but the
// stamp that arms the grace was written only by the next render frame's band
// sync. Between the two — same task turn, no rAF — a digit read a window that
// was already closed and a grace that had not started yet, and fell straight
// through onto the belt. The fix is that `watchRefitWindow` is idempotent and
// is ALSO run at the top of the grace hook (so the close edge is seen at the
// digit's OWN keydown) and at the top of the per-tick input build (so a held
// mouse stream cannot contribute one more sample after an open).
describe('the close edge is seen at the DIGIT\'s keydown, with no frame between (P3)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());
  beforeEach(() => document.body.replaceChildren());

  const GRACE = CLIENT_CONFIG.refit.closeGraceMs;

  const you = (): OwnShip => ({
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: 'torpedoBoat', pts: 1,
    offer: ['radarSweep', 'armor', 'deckGunBarrel', 'navalMines'],
    boostUntil: 0, cards: [], lvl: 0, xp: 0, repairHp: 0,
  });
  const view = (): OfferView => offerView(you(), false, false, false) as OfferView;

  /** main.ts's wiring, in its exact shape: ONE idempotent watcher, run by the
   *  per-frame band sync AND by the grace hook itself. `now` is the shared
   *  clock both of them read. */
  function wired(menu: UpgradeMenu) {
    const clock = { now: 1000 };
    let prevOpen = false;
    let closedAt = -Infinity;
    const watch = (): void => {
      const open = menu.visible;
      closedAt = refitCloseStamp(prevOpen, open, clock.now, closedAt);
      prevOpen = open;
    };
    const fired: number[] = [];
    const picks: number[] = [];
    kb?.detach();
    kb = new KeyboardInput({
      isModalOpen: () => menu.visible,
      isRefitGrace: () => { watch(); return refitGraceActive(clock.now, closedAt, GRACE); },
      isSlotFitted: () => true,
      isAbilitySlot: () => true,
      onAbility: (slot) => fired.push(slot),
      onRefitPick: (c) => picks.push(c),
    });
    kb.attach();
    return { clock, watch, fired, picks };
  }

  it('TAB closes and the very next digit, same task turn, is SWALLOWED', () => {
    const menu = new UpgradeMenu(() => {});
    const w = wired(menu);
    menu.toggle(view()); // TAB — open
    w.watch(); // one frame with the window up
    menu.toggle(view()); // TAB — close, inside the keydown handler
    // NO FRAME RUNS HERE. The digit arrives in the same task turn.
    expect(press('Digit1')).toBe(true); // still prevented
    expect(w.fired).toEqual([]);
    expect(w.picks).toEqual([]);
    expect(kb!.pendingActivationCount).toBe(0);
  });

  it('ESC closes and the very next digit, same task turn, is SWALLOWED', () => {
    const menu = new UpgradeMenu(() => {});
    const w = wired(menu);
    menu.toggle(view());
    w.watch();
    menu.hide(); // ESC — main.ts's handleEscape path, synchronous
    press('Digit1');
    expect(w.fired).toEqual([]);
  });

  it('...and the same key fires once the 400 ms grace lapses', () => {
    const menu = new UpgradeMenu(() => {});
    const w = wired(menu);
    menu.toggle(view());
    w.watch();
    menu.toggle(view()); // close at t = 1000
    press('Digit1');
    expect(w.fired).toEqual([]);
    w.clock.now = 1000 + GRACE - 1;
    press('Digit1');
    expect(w.fired).toEqual([]);
    w.clock.now = 1000 + GRACE; // the edge itself FIRES
    press('Digit1');
    expect(w.fired).toEqual([BELT_1]);
  });

  it('a digit while the window is still OPEN picks, and never reaches the belt', () => {
    const menu = new UpgradeMenu(() => {});
    const w = wired(menu);
    menu.toggle(view());
    press('Digit1');
    expect(w.picks).toEqual([0]);
    expect(w.fired).toEqual([]);
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
      // Story 8.7: every BELT code is a bound key in BOTH of its meanings, so
      // the hygiene sweep covers the whole table rather than a sample of it.
      ...Object.keys(BELT_KEY_CODES), ...Object.keys(REFIT_DIGIT_CODES),
    ]) {
      expect(press(code), code).toBe(true);
    }
  });

  it('preventDefaults the belt digits in EVERY state — open, closed, and inside the grace', () => {
    // The window's state decides what a digit MEANS, never whether the browser
    // gets it: focus must not escape the canvas on any of the three paths.
    for (const hooks of [
      { isModalOpen: () => true },
      { isModalOpen: () => false },
      { isRefitGrace: () => true, isSlotFitted: () => true },
    ] as KeyboardHooks[]) {
      kb?.detach();
      kb = new KeyboardInput(hooks);
      kb.attach();
      for (const code of Object.keys(BELT_KEY_CODES)) expect(press(code), code).toBe(true);
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

  it('DENIES on an unfitted slot — belt INCLUDED — and FAILS CLOSED with no fitted hook', () => {
    // A click on a slot IS its key (amendment 11), so Story 8.5's client-side
    // empty denial reaches it the same way on the WEAPON row. PIN FLIPPED for
    // the BELT (Story 8.7 retires amendment 30's silence): now that a card can
    // stock those squares, an empty one is the same "that key did nothing"
    // sentence — key and click on one row still behave identically, and neither
    // sends anything.
    const denied: number[] = [];
    const fitted = (slot: number): boolean => ALL_FITTED(slot) && slot !== R_SLOT;
    kb = new KeyboardInput({ isSlotFitted: fitted, onEmptySlotDenied: (s) => denied.push(s) });
    kb.slotAction(R_SLOT); // an empty weapon slot
    kb.slotAction(BELT_4); // an empty BELT slot — DENIES since Story 8.7
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.pendingActivationCount).toBe(0);
    expect(denied).toEqual([R_SLOT, BELT_4]);
    const bare = new KeyboardInput();
    bare.slotAction(TORP);
    expect(bare.primedSlot).toBe(SLOT_GUN);
  });

  it('the GUN and the BOOST never deny — only the two CARD-FILLED rows do', () => {
    // Slot 0 is always fitted and slot 1 is empty only on a PvE drone (amendment
    // 24), which no keyboard is attached to: a denial on either could only ever
    // be a construction-gap artefact, so the denial is scoped to the weapon row
    // and the belt — the squares a player actually fills from the refit window.
    const denied: number[] = [];
    kb = new KeyboardInput({ isSlotFitted: () => false, onEmptySlotDenied: (s) => denied.push(s) });
    kb.slotAction(SLOT_GUN);
    kb.slotAction(BOOST);
    expect(denied).toEqual([]);
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
    kb.armReleaseRevert(1); // the pointerdown of click #1 predicted FIREABLE
    expect(kb.primedSlot).toBe(E_SLOT); // …and the prime is STILL showing
    expect(kb.releaseRevertPending).toBe(true);
    expect(kb.releaseRevertClickSeq).toBe(1);
    kb.consumeReleaseRevert(1); // that click's own pointerup
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.releaseRevertPending).toBe(false);
  });

  it('THE DEBT NAMES ITS CLICK: another click\'s release pays nothing', () => {
    // The review fix. A bare boolean was payable by ANY release — the previous
    // click's, arriving in the same 50ms tick as this one's press (a fast
    // double-click), or a second pointer's. Only click #2's own release settles
    // click #2.
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyE');
    kb.armReleaseRevert(2);
    kb.consumeReleaseRevert(1); // the PREVIOUS click's hold ending
    expect(kb.primedSlot).toBe(E_SLOT); // …is not this click's release
    expect(kb.releaseRevertPending).toBe(true);
    kb.consumeReleaseRevert(3); // nor is a later one
    expect(kb.primedSlot).toBe(E_SLOT);
    kb.consumeReleaseRevert(2);
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('A KEY PRESSED MID-HOLD WINS: the switched prime survives the release', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.armReleaseRevert(1); // pointerdown on the Q weapon
    press('KeyE'); // …switched mid-hold
    expect(kb.releaseRevertPending).toBe(false); // the debt is cancelled
    kb.consumeReleaseRevert(1); // pointerup
    expect(kb.primedSlot).toBe(E_SLOT); // still E — the key won
  });

  it('a hotbar CLICK mid-hold cancels it too (clicks are keys — amendment 11)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.armReleaseRevert(1);
    kb.slotAction(R_SLOT);
    kb.consumeReleaseRevert(1);
    expect(kb.primedSlot).toBe(R_SLOT);
  });

  it('a release with nothing armed is a no-op — a DENIED click keeps its prime', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.consumeReleaseRevert(1); // the denied click armed nothing
    expect(kb.primedSlot).toBe(TORP);
  });

  it('arming is idempotent, and one release pays at most one debt', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.armReleaseRevert(1);
    kb.armReleaseRevert(1);
    kb.consumeReleaseRevert(1);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    press('KeyE'); // a fresh prime, with no stale debt behind it
    kb.consumeReleaseRevert(1);
    expect(kb.primedSlot).toBe(E_SLOT);
  });

  it('revertToGun (the hard boundaries) clears the debt as well as the prime', () => {
    // The sinking window's hygiene and the room's resetPrime still revert
    // outright: those end a LIFE, not a trigger pull, and must not leave a debt
    // behind to fire into the next one.
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    kb.armReleaseRevert(1);
    kb.revertToGun();
    expect(kb.releaseRevertPending).toBe(false);
    expect(kb.releaseRevertClickSeq).toBeNull();
    press('KeyE');
    kb.consumeReleaseRevert(1);
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
    //
    // STORY 8.8 gave the three refusals ONE named consumer (`denySlot`) rather
    // than three copies of the same three lines — the capped press, the empty
    // square and the blocked HULL REPAIR square. That is the law getting
    // STRONGER, not weaker: they cannot drift apart now.
    expect(MAIN_TS).toContain('onEmptySlotDenied: denySlot');
    expect(MAIN_TS).toContain('onAbilityCapped: denySlot');
    expect(MAIN_TS).toContain('onPressDenied: denySlot');
    const deny = MAIN_TS.slice(MAIN_TS.indexOf('const denySlot ='));
    expect(deny.slice(0, 200)).toContain('flashSlotDenied(g, slot)');
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
    const body = MAIN_TS.slice(MAIN_TS.indexOf('const denySlot ='), MAIN_TS.indexOf('const denySlot =') + 200);
    for (const forbidden of ['sampler', 'send', 'markPredicted', 'actSeq', 'fireSeq']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });
});

// --- the OTHER wiring seam: ONE watcher owns the window's two edges ----------
//
// Rulings 8 and 9 are both edge rules on the SAME boolean (`upgradeMenu.visible`),
// and both of them are wrong if a second site learns to stamp or to end holds.
// The behaviour is pinned above (refitCloseStamp over the real band, the grace
// predicate, MouseInput.endHolds); what only the SOURCE can say is that the
// watcher is singular, lives in the per-frame band sync, and is what feeds the
// chokepoint's hook.

describe('main.ts wires ONE refit-visibility watcher (rulings 8 + 9)', () => {
  const MAIN_TS = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../main.ts'),
    'utf8',
  );

  it('stamps refitClosedAt in EXACTLY ONE place — the watcher', () => {
    const writes = [...MAIN_TS.matchAll(/refitClosedAt\s*=[^=]/g)];
    // Exactly one assignment — the watcher's stamp (the Game literal seeds it
    // with a `:`). A second means a close path learned to stamp for itself,
    // which is the drift the single watcher exists to prevent: TAB, ESC, the
    // last spend, spectate and the you-gone force-hide all close the window
    // through `visible` alone.
    expect(writes).toHaveLength(1);
    expect(MAIN_TS).toContain('refitClosedAt: -Infinity'); // never in grace at boot
  });

  it('runs the watcher from the per-frame band sync, and ends held streams on the OPEN edge', () => {
    const sync = MAIN_TS.slice(MAIN_TS.indexOf('function syncRefitBand('));
    const body = sync.slice(0, 600);
    expect(body).toContain('watchRefitWindow(g)');
    const watcher = MAIN_TS.slice(MAIN_TS.indexOf('function watchRefitWindow('), MAIN_TS.length);
    const watcherBody = watcher.slice(0, 900);
    expect(watcherBody).toContain('refitCloseStamp(');
    expect(watcherBody).toContain('endHolds()'); // ruling 9, on the false→true edge
    // …and the queued presses are NOT dropped with the stream: an already-armed
    // ability press is a press (ruling 9, verbatim).
    expect(watcherBody).not.toContain('clearActivations');
  });

  // P3: the watcher is idempotent, so the two sites that must NOT wait for the
  // next frame run it themselves — the grace hook (the digit's own keydown) and
  // the per-tick input build (before the mouse hold is sampled).
  it('runs the watcher from the grace hook AND from the per-tick input build', () => {
    const hook = MAIN_TS.slice(MAIN_TS.indexOf('isRefitGrace:'), MAIN_TS.indexOf('isRefitGrace:') + 400);
    expect(hook).toContain('watchRefitWindow(');
    const tick = MAIN_TS.slice(MAIN_TS.indexOf('simTick: () => {'));
    const build = tick.slice(0, tick.indexOf('g.sampler.sample('));
    expect(build).toContain('watchRefitWindow(g)');
  });

  it('feeds the chokepoint the grace off CLIENT_CONFIG.refit.closeGraceMs', () => {
    const hook = MAIN_TS.slice(MAIN_TS.indexOf('isRefitGrace:'));
    expect(hook.slice(0, 200)).toContain('refitInGrace(');
    const helper = MAIN_TS.slice(MAIN_TS.indexOf('function refitInGrace('));
    expect(helper.slice(0, 400)).toContain('refitGraceActive(');
    expect(helper.slice(0, 400)).toContain('CLIENT_CONFIG.refit.closeGraceMs');
  });
});
