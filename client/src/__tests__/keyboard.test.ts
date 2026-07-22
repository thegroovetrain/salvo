import { describe, it, expect, afterEach } from 'vitest';
import { SLOT_GUN } from '@salvo/shared';
import {
  rudderFrom,
  panAxesFrom,
  primeSlotFromKey,
  nextPrimedSlot,
  slotHoldsAbility,
  upgradeActionFromKey,
  KeyboardInput,
  type UpgradeAction,
} from '../input/keyboard.js';

const TORP = 1;
const MINE = 2;

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

describe('primeSlotFromKey', () => {
  it('maps 1/2/3 (top row + numpad) to slots gun(0)/torpedo(1)/mine(2)', () => {
    expect(primeSlotFromKey('Digit1')).toBe(SLOT_GUN);
    expect(primeSlotFromKey('Digit2')).toBe(TORP);
    expect(primeSlotFromKey('Digit3')).toBe(MINE);
    expect(primeSlotFromKey('Numpad1')).toBe(SLOT_GUN);
    expect(primeSlotFromKey('Numpad2')).toBe(TORP);
    expect(primeSlotFromKey('Numpad3')).toBe(MINE);
  });

  it('returns null for non-number keys (so the prime is left unchanged)', () => {
    expect(primeSlotFromKey('KeyW')).toBeNull();
    expect(primeSlotFromKey('Digit4')).toBeNull();
    expect(primeSlotFromKey('Space')).toBeNull();
  });
});

describe('nextPrimedSlot — set / cancel / revert', () => {
  it('priming a fresh slot from the gun sets that slot', () => {
    expect(nextPrimedSlot(SLOT_GUN, TORP)).toBe(TORP);
    expect(nextPrimedSlot(SLOT_GUN, MINE)).toBe(MINE);
  });

  it('pressing the SAME primed key again cancels back to the gun', () => {
    expect(nextPrimedSlot(TORP, TORP)).toBe(SLOT_GUN);
    expect(nextPrimedSlot(MINE, MINE)).toBe(SLOT_GUN);
  });

  it('pressing 1 (gun) always reverts to the gun, whatever was primed', () => {
    expect(nextPrimedSlot(TORP, SLOT_GUN)).toBe(SLOT_GUN);
    expect(nextPrimedSlot(MINE, SLOT_GUN)).toBe(SLOT_GUN);
    expect(nextPrimedSlot(SLOT_GUN, SLOT_GUN)).toBe(SLOT_GUN);
  });

  it('switching directly between two primed slots swaps (no intermediate cancel)', () => {
    expect(nextPrimedSlot(TORP, MINE)).toBe(MINE);
    expect(nextPrimedSlot(MINE, TORP)).toBe(TORP);
  });
});

describe('upgradeActionFromKey', () => {
  // FINDING C: the toggle is no longer decodable from a single (code, ctrl)
  // pair — it fires on Control's keyUp, suppressed if any chord fired during
  // the hold (see KeyboardInput.handleControlUp). upgradeActionFromKey stays
  // pure and chord-only; Control itself never classifies here.
  it('does not classify bare Control — the toggle is Control-keyUp adapter logic', () => {
    expect(upgradeActionFromKey('ControlLeft', true)).toBeNull();
    expect(upgradeActionFromKey('ControlRight', true)).toBeNull();
  });

  it('maps CTRL+digit (top row + numpad) to offer slots 0/1/2', () => {
    expect(upgradeActionFromKey('Digit1', true)).toEqual({ kind: 'choose', slot: 0 });
    expect(upgradeActionFromKey('Digit2', true)).toEqual({ kind: 'choose', slot: 1 });
    expect(upgradeActionFromKey('Digit3', true)).toEqual({ kind: 'choose', slot: 2 });
    expect(upgradeActionFromKey('Numpad1', true)).toEqual({ kind: 'choose', slot: 0 });
    expect(upgradeActionFromKey('Numpad3', true)).toEqual({ kind: 'choose', slot: 2 });
  });

  it('maps CTRL+E to heal', () => {
    expect(upgradeActionFromKey('KeyE', true)).toEqual({ kind: 'heal' });
  });

  it('requires CTRL for digits/E (a plain digit stays a weapon key → null here)', () => {
    expect(upgradeActionFromKey('Digit1', false)).toBeNull();
    expect(upgradeActionFromKey('KeyE', false)).toBeNull();
  });

  it('is null for CTRL+non-window keys (Digit4, KeyW, Space)', () => {
    expect(upgradeActionFromKey('Digit4', true)).toBeNull();
    expect(upgradeActionFromKey('KeyW', true)).toBeNull();
    expect(upgradeActionFromKey('Space', true)).toBeNull();
  });
});

// --- KeyboardInput adapter: real keydown/keyup edges via window events -------

function press(code: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
}

/** Dispatch a keydown with CTRL held; returns true if the handler preventDefault'd it. */
function pressCtrl(code: string, repeat = false): boolean {
  const e = new KeyboardEvent('keydown', { code, repeat, ctrlKey: true, cancelable: true });
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
    press('KeyW', true); // auto-repeat while held
    press('KeyW', true);
    expect(kb.throttleIndex).toBe(5); // still one step from neutral (4)
    expect(kb.throttle).toBe(0.25);
  });

  it('fires onDetent with the direction + changed flag (silent at the end stop)', () => {
    const calls: Array<[number, boolean]> = [];
    kb = new KeyboardInput((dir, changed) => calls.push([dir, changed]));
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

  it('primes a slot from 2/3 and keeps the prime across clearKeys', () => {
    kb = new KeyboardInput();
    kb.attach();
    expect(kb.primedSlot).toBe(SLOT_GUN);
    press('Digit2');
    expect(kb.primedSlot).toBe(TORP);
    kb.clearKeys();
    expect(kb.primedSlot).toBe(TORP); // prime survives clearKeys, like the old latch
  });

  it('the same prime key again cancels back to the gun; Digit1 also reverts', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('Digit3'); // prime mine
    expect(kb.primedSlot).toBe(MINE);
    press('Digit3'); // same key cancels
    expect(kb.primedSlot).toBe(SLOT_GUN);
    press('Digit2'); // prime torpedo
    expect(kb.primedSlot).toBe(TORP);
    press('Digit1'); // explicit revert to gun
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('revertToGun() clears the prime (called by main.ts on a fireable click)', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('Digit2');
    expect(kb.primedSlot).toBe(TORP);
    kb.revertToGun();
    expect(kb.primedSlot).toBe(SLOT_GUN);
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

describe('KeyboardInput — CTRL upgrade window', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  it('CTRL+Digit2 fires the upgrade chord, preventDefaults, and does NOT prime a slot', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    const prevented = pressCtrl('Digit2');
    expect(actions).toEqual([{ kind: 'choose', slot: 1 }]);
    expect(prevented).toBe(true);
    expect(kb.primedSlot).toBe(SLOT_GUN); // CTRL short-circuits before the prime logic
  });

  it('a plain Digit2 still primes a slot (no CTRL → not an upgrade key)', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    press('Digit2');
    expect(actions).toEqual([]);
    expect(kb.primedSlot).toBe(TORP);
  });

  // FINDING C: the toggle moved from Control keyDOWN to Control keyUP, and is
  // suppressed whenever any other key fires during the hold — this is what
  // stops CTRL+1 from popping the window open only to immediately close it
  // before the spend renders, and stops an unrelated browser chord (ctrl+C,
  // ctrl+T) from toggling the game window at all.

  it('ctrl press+release with nothing else in between: exactly one toggle, fired on release', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('ControlLeft');
    expect(actions).toEqual([]); // NOT on keydown
    release('ControlLeft');
    expect(actions).toEqual([{ kind: 'toggle' }]); // fires on keyup
  });

  it('repeat Control keydowns while held do not corrupt the toggle state', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('ControlLeft');
    pressCtrl('ControlLeft', true); // OS auto-repeat while held
    pressCtrl('ControlLeft', true);
    expect(actions).toEqual([]); // still nothing until release
    release('ControlLeft');
    expect(actions).toEqual([{ kind: 'toggle' }]); // exactly one, on release
  });

  it('CTRL+Digit1 fires the choose chord, and suppresses the toggle on the subsequent Control keyup', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('ControlLeft');
    pressCtrl('Digit1');
    expect(actions).toEqual([{ kind: 'choose', slot: 0 }]);
    release('ControlLeft');
    expect(actions).toEqual([{ kind: 'choose', slot: 0 }]); // no toggle appended
  });

  it('ctrl+KeyC (not a chord we handle) does not tap the telegraph, and does not toggle on release', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('ControlLeft');
    pressCtrl('KeyC'); // an unrelated browser chord (e.g. copy) — not a window key
    expect(actions).toEqual([]);
    expect(kb.throttle).toBe(0); // and it did not ring the engine up
    release('ControlLeft');
    expect(actions).toEqual([]); // still nothing — the chord suppressed the toggle
  });

  it('CTRL+KeyW does not tap the telegraph (CTRL is a modifier, never drives)', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('KeyW');
    expect(actions).toEqual([]); // KeyW is not a window key
    expect(kb.throttle).toBe(0); // and it did not ring the engine up
  });

  it('blur mid-hold clears the hold, so a late/missed Control keyup fires no toggle', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('ControlLeft');
    window.dispatchEvent(new Event('blur'));
    release('ControlLeft'); // a keyup that arrives despite the blur (or never would in real browsers)
    expect(actions).toEqual([]);
  });
});

// --- Story 1.6: ability slot — the slot-2 key activates on the TB, primes on BB/ML ---

describe('slotHoldsAbility — the loadout-driven weapon/ability split', () => {
  const TB_SLOTS = ['gun', 'torpedo', 'speedBoost', null] as const; // Torpedo Boat
  const BB_SLOTS = ['gun', 'cannon', 'starShells', null] as const; // Battleship (both specials weapons)
  const ML_SLOTS = ['gun', 'mine', 'decoyBuoy', null] as const; // Mine Layer (both specials abilities, Story 1.8)

  it('is true only for a slot holding EQUIPMENT_IS_WEAPON:false equipment', () => {
    expect(slotHoldsAbility(TB_SLOTS, 2)).toBe(true); // speedBoost
    expect(slotHoldsAbility(TB_SLOTS, 0)).toBe(false); // gun
    expect(slotHoldsAbility(TB_SLOTS, 1)).toBe(false); // torpedo
    expect(slotHoldsAbility(BB_SLOTS, 1)).toBe(false); // cannon is a weapon
    expect(slotHoldsAbility(BB_SLOTS, 2)).toBe(false); // star shells is a weapon
  });

  it('the Mine Layer answers true for BOTH specials — mine (slot 1) + decoyBuoy (slot 2)', () => {
    expect(slotHoldsAbility(ML_SLOTS, 1)).toBe(true); // Story 1.8: mine is activateable now
    expect(slotHoldsAbility(ML_SLOTS, 2)).toBe(true); // decoyBuoy
    expect(slotHoldsAbility(ML_SLOTS, 0)).toBe(false); // gun stays a weapon
  });

  it('is false for empty and out-of-range slots', () => {
    expect(slotHoldsAbility(TB_SLOTS, 3)).toBe(false); // empty extra slot
    expect(slotHoldsAbility(TB_SLOTS, 7)).toBe(false); // out of range
  });
});

describe('KeyboardInput — ability activation (TB/ML) vs prime (BB weapon special)', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  /** A TB-shaped predicate: slot 2 holds the speedBoost ability. */
  const tbAbilitySlot = (slot: number): boolean => slot === 2;

  it('slot-2 press QUEUES; the wire counter advances only on consumeActivation', () => {
    const presses: number[] = [];
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot, (slot) => presses.push(slot));
    kb.attach();
    expect(kb.actSeq).toBe(0); // the 0 sentinel before any press
    press('Digit3');
    // Press feedback (onAbility) is immediate, but the wire counter does NOT
    // advance at press time — the press is queued.
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
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot, (_slot, actSeq) => rides.push(actSeq));
    kb.attach();
    press('Digit3'); // first queued → will ride actSeq 1
    press('Digit3'); // second queued behind it → will ride actSeq 2
    expect(rides).toEqual([1, 2]);
  });

  it('repeated presses are strictly monotonic once drained; OS auto-repeat does not count', () => {
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot);
    kb.attach();
    press('Digit3');
    press('Digit3', true); // held-key auto-repeat — filtered
    press('Numpad3');
    press('Digit3');
    expect(kb.pendingActivationCount).toBe(3); // 3 genuine edges queued
    for (let i = 0; i < 3; i++) kb.consumeActivation();
    expect(kb.actSeq).toBe(3); // monotonic, one per drained press
    expect(kb.primedSlot).toBe(SLOT_GUN);
  });

  it('an activation press never disturbs an existing prime (torpedo stays primed)', () => {
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot);
    kb.attach();
    press('Digit2'); // prime the torpedo
    expect(kb.primedSlot).toBe(TORP);
    press('Digit3'); // boost activation — queued, independent of the prime
    expect(kb.primedSlot).toBe(TORP); // prime untouched
    kb.consumeActivation();
    expect(kb.actSeq).toBe(1);
  });

  it('a cooling/dead press still queues + fires the callback (the server decides)', () => {
    // The keyboard has no denial concept at all — main.ts predicts the verdict
    // for feedback only; every genuine press edge queues and rides an input.
    const presses: number[] = [];
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot, (slot) => presses.push(slot));
    kb.attach();
    press('Digit3');
    press('Digit3');
    expect(presses).toEqual([2, 2]);
    kb.consumeActivation();
    kb.consumeActivation();
    expect(kb.actSeq).toBe(2);
  });

  // --- FINDING A: two abilities in one 50ms window must NOT collapse ----------

  it('the Mine Layer activates BOTH specials — two different-slot presses ride SUCCESSIVE inputs', () => {
    // Story 1.8: the ML fit is [gun, mine, decoyBuoy, empty] and both specials
    // are instant abilities. FINDING A: pressing 2 then 3 inside one sample
    // window must not overwrite the slot — draining ONE per input rides the mine
    // this input and the decoy the next, so neither is lost.
    const presses: number[] = [];
    kb = new KeyboardInput(
      undefined,
      undefined,
      (slot) => slotHoldsAbility(['gun', 'mine', 'decoyBuoy', null], slot),
      (slot) => presses.push(slot),
    );
    kb.attach();
    press('Digit2'); // mine — slot 1
    press('Digit3'); // decoy — slot 2, same window
    expect(presses).toEqual([1, 2]); // both press callbacks fired
    expect(kb.pendingActivationCount).toBe(2);
    expect(kb.actSeq).toBe(0); // nothing consumed yet
    kb.consumeActivation(); // this input
    expect(kb.actSeq).toBe(1);
    expect(kb.actSlot).toBe(1); // the FIRST press (mine) — NOT lost
    kb.consumeActivation(); // next input
    expect(kb.actSeq).toBe(2);
    expect(kb.actSlot).toBe(2); // the second press (decoy)
    expect(kb.primedSlot).toBe(SLOT_GUN); // neither special ever primes
  });

  it('same-slot double-tap in one window drains as TWO consecutive activations (upgraded pool)', () => {
    // A mineAmmo-upgraded pool double-tapped within 50ms must drop TWO mines, not
    // one — each tap rides its own input, actSeq +1 each, actSlot the same slot.
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot);
    kb.attach();
    press('Digit3');
    press('Digit3');
    expect(kb.pendingActivationCount).toBe(2);
    kb.consumeActivation();
    expect(kb.actSeq).toBe(1);
    expect(kb.actSlot).toBe(2);
    kb.consumeActivation();
    expect(kb.actSeq).toBe(2); // the second tap is NOT dropped
    expect(kb.actSlot).toBe(2);
  });

  it('consumeActivation is a no-op with an empty queue (repeats the counters — the "no new press" signal)', () => {
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot);
    kb.attach();
    press('Digit3');
    kb.consumeActivation();
    expect(kb.actSeq).toBe(1);
    kb.consumeActivation(); // nothing queued
    expect(kb.actSeq).toBe(1); // unchanged
    expect(kb.actSlot).toBe(2);
  });

  it('the queue caps at SLOT_COUNT (4) — pathological mashing drops silently', () => {
    const presses: number[] = [];
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot, (slot) => presses.push(slot));
    kb.attach();
    for (let i = 0; i < 7; i++) press('Digit3'); // 7 presses in one window
    expect(kb.pendingActivationCount).toBe(4); // capped
    expect(presses).toHaveLength(4); // over-cap presses never reach onAbility either
  });

  it('clearActivations drops the pending queue but LEAVES the consumed counters monotonic', () => {
    kb = new KeyboardInput(undefined, undefined, tbAbilitySlot);
    kb.attach();
    press('Digit3');
    kb.consumeActivation(); // actSeq 1
    press('Digit3'); // queue a second (would ride actSeq 2)
    press('Digit3'); // and a third
    expect(kb.pendingActivationCount).toBe(2);
    kb.clearActivations(); // death / respawn / reconnect boundary
    expect(kb.pendingActivationCount).toBe(0);
    expect(kb.actSeq).toBe(1); // NOT reset — mirrors the server's un-reset lastActSeq
    // A fresh press after the clear rides the next counter value, not a stale one.
    press('Digit3');
    kb.consumeActivation();
    expect(kb.actSeq).toBe(2);
  });

  it('on a WEAPON-special loadout (BB) the same key PRIMES exactly as today and actSeq stays 0', () => {
    // The Battleship's specials (cannon, star shells) are weapons — key 3 primes
    // slot 2 exactly as the interregnum mine used to, no ability routing.
    kb = new KeyboardInput(undefined, undefined, (slot) => slotHoldsAbility(['gun', 'cannon', 'starShells', null], slot));
    kb.attach();
    press('Digit3');
    expect(kb.primedSlot).toBe(MINE); // slot 2 (star shells) — primes like a weapon
    expect(kb.actSeq).toBe(0); // the sentinel never advances
    expect(kb.actSlot).toBe(0);
  });

  it('without a predicate at all (legacy construction) every slot key primes', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('Digit3');
    expect(kb.primedSlot).toBe(MINE);
    expect(kb.actSeq).toBe(0);
  });
});
