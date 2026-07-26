// The in-match keyboard chokepoint (Story 2.1 — the fixed v1 Q/E/R scheme):
// pure helpers (rudderFrom/panAxesFrom/nextPrimedSlot/slotHoldsAbility/
// textEntryFocused) plus the KeyboardInput adapter driven through real window
// keydown/keyup events (jsdom). Pins the ruled behavior: weapon switch-to /
// same-key revert, ability FIFO + capped-press denied feedback, refit-or-
// nothing digits, modal suspension of slot keys, the text-entry guard, and
// preventDefault hygiene for every bound key (TAB + Space included) while
// modifier chords stay native.

import { describe, it, expect, afterEach } from 'vitest';
import { SLOT_GUN } from '@salvo/shared';
import {
  rudderFrom,
  panAxesFrom,
  nextPrimedSlot,
  slotHoldsAbility,
  textEntryFocused,
  SLOT_KEY_CODES,
  REFIT_DIGIT_CODES,
  KeyboardInput,
  type KeyboardHooks,
} from '../input/keyboard.js';

const TORP = 1;
const BOOST = 2;

/** A fully-fitted loadout (slots 1–3 all hold equipment). The fitted hook FAILS
 *  CLOSED, so every suite that exercises priming/activation must wire it — a
 *  bare KeyboardInput has no fitted slots at all (Story 2.1 review fix). */
const ALL_FITTED = (slot: number): boolean => slot >= 1 && slot <= 3;

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
  it('Q/E/R map to loadout slots 1/2/3 — the gun (slot 0) has NO key', () => {
    expect(SLOT_KEY_CODES).toEqual({ KeyQ: 1, KeyE: 2, KeyR: 3 });
    expect(Object.values(SLOT_KEY_CODES)).not.toContain(SLOT_GUN);
  });

  it('digits 1–4 (top row + numpad) map to refit-card picks 0..3', () => {
    expect(REFIT_DIGIT_CODES.Digit1).toBe(0);
    expect(REFIT_DIGIT_CODES.Digit4).toBe(3);
    expect(REFIT_DIGIT_CODES.Numpad1).toBe(0);
    expect(REFIT_DIGIT_CODES.Numpad4).toBe(3);
  });
});

describe('nextPrimedSlot — switch-to / same-key revert', () => {
  it('priming a fresh weapon slot from the gun switches to that slot', () => {
    expect(nextPrimedSlot(SLOT_GUN, TORP)).toBe(TORP);
    expect(nextPrimedSlot(SLOT_GUN, 2)).toBe(2);
  });

  it('pressing the SAME primed key again reverts to the gun (amendment 5)', () => {
    expect(nextPrimedSlot(TORP, TORP)).toBe(SLOT_GUN);
    expect(nextPrimedSlot(2, 2)).toBe(SLOT_GUN);
  });

  it('switching directly between two primed slots swaps (no intermediate revert)', () => {
    expect(nextPrimedSlot(TORP, 2)).toBe(2);
    expect(nextPrimedSlot(2, TORP)).toBe(TORP);
  });
});

describe('slotHoldsAbility — the loadout-driven weapon/ability split', () => {
  const TB_SLOTS = ['gun', 'torpedo', 'speedBoost', null] as const; // Torpedo Boat
  const BB_SLOTS = ['gun', 'cannon', 'starShells', null] as const; // Battleship (both specials weapons)
  const ML_SLOTS = ['gun', 'mine', 'decoyBuoy', null] as const; // Mine Layer (both specials abilities)

  it('is true only for a slot holding EQUIPMENT_IS_WEAPON:false equipment', () => {
    expect(slotHoldsAbility(TB_SLOTS, 2)).toBe(true); // speedBoost
    expect(slotHoldsAbility(TB_SLOTS, 0)).toBe(false); // gun
    expect(slotHoldsAbility(TB_SLOTS, 1)).toBe(false); // torpedo
    expect(slotHoldsAbility(BB_SLOTS, 1)).toBe(false); // cannon is a weapon
    expect(slotHoldsAbility(BB_SLOTS, 2)).toBe(false); // star shells is a weapon
  });

  it('the Mine Layer answers true for BOTH specials — mine (slot 1) + decoyBuoy (slot 2)', () => {
    expect(slotHoldsAbility(ML_SLOTS, 1)).toBe(true);
    expect(slotHoldsAbility(ML_SLOTS, 2)).toBe(true);
    expect(slotHoldsAbility(ML_SLOTS, 0)).toBe(false); // gun stays a weapon
  });

  it('is false for empty and out-of-range slots', () => {
    expect(slotHoldsAbility(TB_SLOTS, 3)).toBe(false); // empty extra slot
    expect(slotHoldsAbility(TB_SLOTS, 7)).toBe(false); // out of range
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

  it('Q primes slot 1; the same key again reverts to the gun', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    expect(kb.primedSlot).toBe(SLOT_GUN);
    press('KeyQ');
    expect(kb.primedSlot).toBe(TORP);
    press('KeyQ'); // same key again — switch back (amendment 5)
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('switching Q → E swaps the prime directly (BB: both specials weapons)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    press('KeyQ');
    expect(kb.primedSlot).toBe(1);
    press('KeyE');
    expect(kb.primedSlot).toBe(2);
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

  it('an UNFITTED slot key is inert — R with an empty slot 3 primes nothing', () => {
    kb = new KeyboardInput({ isSlotFitted: (slot) => slot >= 1 && slot !== 3 });
    kb.attach();
    const prevented = press('KeyR');
    expect(prevented).toBe(true); // still a bound key — default prevented
    expect(kb.primedSlot).toBe(SLOT_GUN); // but nothing primed, no feedback
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

  /** A TB-shaped predicate: slot 2 (E) holds the speedBoost ability. */
  const tbAbilitySlot = (slot: number): boolean => slot === 2;

  it('an ability press QUEUES; the wire counter advances only on consumeActivation', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: tbAbilitySlot,
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    expect(kb.actSeq).toBe(0); // the 0 sentinel before any press
    press('KeyE');
    expect(presses).toEqual([2]);
    expect(kb.pendingActivationCount).toBe(1);
    expect(kb.actSeq).toBe(0);
    kb.consumeActivation(); // one input built → drain one press
    expect(kb.actSeq).toBe(1);
    expect(kb.actSlot).toBe(2);
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.primedSlot).toBe(SLOT_GUN); // NEVER primes
  });

  it('onAbility carries the actSeq the press WILL ride (consumedCount + queue depth)', () => {
    const rides: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: tbAbilitySlot,
      onAbility: (_slot, actSeq) => rides.push(actSeq),
    });
    kb.attach();
    press('KeyE'); // first queued → will ride actSeq 1
    press('KeyE'); // second queued behind it → will ride actSeq 2
    expect(rides).toEqual([1, 2]);
  });

  it('the ML activates BOTH specials — two different-slot presses ride SUCCESSIVE inputs', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: (slot) => slot === 1 || slot === 2,
      isAbilitySlot: (slot) => slotHoldsAbility(['gun', 'mine', 'decoyBuoy', null], slot),
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    press('KeyQ'); // mine — slot 1
    press('KeyE'); // decoy — slot 2, same window
    expect(presses).toEqual([1, 2]);
    expect(kb.pendingActivationCount).toBe(2);
    kb.consumeActivation();
    expect([kb.actSeq, kb.actSlot]).toEqual([1, 1]); // the FIRST press — NOT lost
    kb.consumeActivation();
    expect([kb.actSeq, kb.actSlot]).toEqual([2, 2]);
    expect(kb.primedSlot).toBe(SLOT_GUN); // neither special ever primes
  });

  it('an activation press never disturbs an existing weapon prime', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, isAbilitySlot: tbAbilitySlot });
    kb.attach();
    press('KeyQ'); // prime the torpedo (slot 1, a weapon on the TB)
    press('KeyE'); // boost activation — queued, independent of the prime
    expect(kb.primedSlot).toBe(TORP);
    kb.consumeActivation();
    expect(kb.actSeq).toBe(1);
  });

  it('a cooling/dead press still queues + fires the callback (the server decides)', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: tbAbilitySlot,
      onAbility: (slot) => presses.push(slot),
    });
    kb.attach();
    press('KeyE');
    press('KeyE');
    expect(presses).toEqual([2, 2]);
    kb.consumeActivation();
    kb.consumeActivation();
    expect(kb.actSeq).toBe(2);
  });

  it('consumeActivation is a no-op with an empty queue (repeats the counters)', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, isAbilitySlot: tbAbilitySlot });
    kb.attach();
    press('KeyE');
    kb.consumeActivation();
    expect(kb.actSeq).toBe(1);
    kb.consumeActivation(); // nothing queued
    expect(kb.actSeq).toBe(1); // unchanged
    expect(kb.actSlot).toBe(2);
  });

  it('the FIFO caps at 4 — the 5th same-window press gets DENIED FEEDBACK, never silence', () => {
    const presses: number[] = [];
    const capped: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: tbAbilitySlot,
      onAbility: (slot) => presses.push(slot),
      onAbilityCapped: (slot) => capped.push(slot),
    });
    kb.attach();
    for (let i = 0; i < 7; i++) press('KeyE'); // 7 presses in one window
    expect(kb.pendingActivationCount).toBe(4); // capped
    expect(presses).toHaveLength(4); // over-cap presses never reach onAbility
    expect(capped).toEqual([2, 2, 2]); // …but EACH fires the denied-feedback hook (Story 2.1)
  });

  it('clearActivations drops the pending queue but LEAVES the consumed counters monotonic', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, isAbilitySlot: tbAbilitySlot });
    kb.attach();
    press('KeyE');
    kb.consumeActivation(); // actSeq 1
    press('KeyE');
    press('KeyE');
    expect(kb.pendingActivationCount).toBe(2);
    kb.clearActivations(); // death / respawn / reconnect boundary
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.actSeq).toBe(1); // NOT reset — mirrors the server's un-reset lastActSeq
    press('KeyE');
    kb.consumeActivation();
    expect(kb.actSeq).toBe(2);
  });

  it('on a WEAPON-special loadout (BB) the same keys PRIME and actSeq stays 0', () => {
    kb = new KeyboardInput({
      isSlotFitted: (slot) => slot === 1 || slot === 2,
      isAbilitySlot: (slot) => slotHoldsAbility(['gun', 'cannon', 'starShells', null], slot),
    });
    kb.attach();
    press('KeyE');
    expect(kb.primedSlot).toBe(2); // star shells — primes like a weapon
    expect(kb.actSeq).toBe(0); // the sentinel never advances
    expect(kb.actSlot).toBe(0);
  });

  it('FAILS CLOSED without the fitted hook: a bare construction primes NOTHING', () => {
    // The hook is the only source of truth for what is fitted. Absent it, no
    // slot beyond the gun counts as fitted — a future construction site that
    // forgets to wire it gets inert slot keys, never the ruled-away "R primes
    // an empty slot" behavior.
    kb = new KeyboardInput();
    kb.attach();
    for (const code of ['KeyQ', 'KeyE', 'KeyR']) {
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
    let toggles = 0;
    kb = new KeyboardInput({ onRefitToggle: () => (toggles += 1) });
    kb.attach();
    expect(press('Tab', { shiftKey: true })).toBe(true); // prevented: focus stays on the canvas
    expect(toggles).toBe(0); // …but NO action
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

  it('slot keys (Q/E/R) are SUSPENDED while the modal is open — full combat lockout', () => {
    const pressed: number[] = [];
    let open = true;
    kb = new KeyboardInput({
      isModalOpen: () => open,
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: (slot) => slot === 2,
      onAbility: (slot) => pressed.push(slot),
    });
    kb.attach();
    expect(press('KeyQ')).toBe(true); // still prevented (bound key)…
    expect(press('KeyE')).toBe(true);
    expect(kb.primedSlot).toBe(SLOT_GUN); // …but no prime
    expect(pressed).toEqual([]); // …and no ability queue
    expect(kb.pendingActivationCount).toBe(0);
    open = false; // modal closed → keys live again
    press('KeyQ');
    expect(kb.primedSlot).toBe(1);
  });

  it('helm keys stay LIVE while the modal is open (the sim never pauses)', () => {
    kb = new KeyboardInput({ isModalOpen: () => true });
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
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'Tab', 'Digit1', 'KeyX', 'KeyZ', 'KeyM', 'KeyP']) {
      expect(press(code), code).toBe(true); // still preventDefault-ed: focus can't escape
    }
    expect(log).toEqual([]);
    expect(k.throttle).toBe(0); // the helm never moved
    expect(k.primedSlot).toBe(SLOT_GUN);
  });

  it('still routes ESC and ENTER — the two keys that dismiss the surface', () => {
    const { kb: k, log } = overlayKb();
    kb = k;
    press('Escape');
    press('Enter');
    expect(log).toEqual(['esc', 'enter']);
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

  it('M fires onMute, P fires onNetDebug — edge-only', () => {
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

  it('preventDefaults EVERY bound key — W/A/S/D, arrows, Q/E/R, F, Space, digits, TAB, ESC, ENTER, Z/X/M/P', () => {
    kb = new KeyboardInput();
    kb.attach();
    for (const code of [
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'Space', 'Digit1', 'Digit4', 'Numpad2',
      'Tab', 'Escape', 'Enter', 'NumpadEnter', 'KeyZ', 'KeyX', 'KeyM', 'KeyP',
    ]) {
      expect(press(code), code).toBe(true);
    }
  });

  it('F (Foghorn-reserved) and Space are fully inert — prevented, zero state change', () => {
    const picks: number[] = [];
    kb = new KeyboardInput({ onRefitPick: (c) => picks.push(c), isModalOpen: () => true });
    kb.attach();
    expect(press('KeyF')).toBe(true);
    expect(press('Space')).toBe(true);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.throttle).toBe(0);
    expect(picks).toEqual([]);
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

  const tbAbilitySlot = (slot: number): boolean => slot === BOOST;

  it('a weapon slot toggles the prime, exactly like its key', () => {
    kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.slotAction(TORP);
    expect(kb.primedSlot).toBe(TORP);
    kb.slotAction(TORP); // same slot again reverts to the gun
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('the GUN slot (which no key addresses) selects the gun', () => {
    kb = new KeyboardInput({ isSlotFitted: (slot) => slot <= 3 });
    kb.slotAction(TORP);
    expect(kb.primedSlot).toBe(TORP);
    kb.slotAction(SLOT_GUN);
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('an ability slot activates through the SAME FIFO (never primes)', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: tbAbilitySlot,
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
      isAbilitySlot: tbAbilitySlot,
      onAbilityCapped: (slot) => capped.push(slot),
    });
    for (let i = 0; i < 5; i++) kb.slotAction(BOOST); // SLOT_COUNT (4) fit, the 5th is capped
    expect(kb.pendingActivationCount).toBe(4);
    expect(capped).toEqual([BOOST]);
  });

  it('is SUSPENDED while the refit modal is open (clicks are dead, like the keys)', () => {
    const presses: number[] = [];
    kb = new KeyboardInput({
      isSlotFitted: ALL_FITTED,
      isAbilitySlot: tbAbilitySlot,
      isModalOpen: () => true,
      onAbility: (slot) => presses.push(slot),
    });
    kb.slotAction(TORP);
    kb.slotAction(BOOST);
    expect(kb.primedSlot).toBe(SLOT_GUN);
    expect(presses).toEqual([]);
  });

  it('is inert on an unfitted slot, and FAILS CLOSED with no fitted hook wired', () => {
    kb = new KeyboardInput({ isSlotFitted: (slot) => slot !== 3 });
    kb.slotAction(3); // the empty extra slot
    expect(kb.primedSlot).toBe(SLOT_GUN);
    const bare = new KeyboardInput();
    bare.slotAction(TORP);
    expect(bare.primedSlot).toBe(SLOT_GUN);
  });
});
