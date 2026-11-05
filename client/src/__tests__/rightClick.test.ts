// THE RIGHT BUTTON WITH A READIED WEAPON (Story 10.5, 2026-11-05, epic-10
// amendment 10 — orchestrator ruling B). The pure decision
// (input/rightClick.ts) and its wiring through the real MouseInput +
// KeyboardInput pair (the prime model is the keyboard's): a right PRESS with a
// weapon readied cancels the ready and fires NO secondaries; while a weapon is
// readied the secondaries level is never sent; with nothing readied the right
// button is Story 10.4's secondaries, untouched.

import { describe, it, expect } from 'vitest';
import { SLOT_GUN, WEAPON_SLOTS } from '@salvo/shared';
import { rightPressVerdict, secondariesLevel, type RightPressFacts } from '../input/rightClick.js';
import { MouseInput } from '../input/mouse.js';
import { KeyboardInput } from '../input/keyboard.js';

const [Q] = WEAPON_SLOTS;

/** A press on the canvas, unlocked, off the bar. */
const CLEAR: RightPressFacts = { onCanvas: true, locked: false, overHotbar: false, readied: false };

describe('rightPressVerdict — what one right press does', () => {
  it('nothing readied → the secondaries; a weapon readied → cancel the ready', () => {
    expect(rightPressVerdict(CLEAR)).toBe('secondaries');
    expect(rightPressVerdict({ ...CLEAR, readied: true })).toBe('cancelReady');
  });

  it('the Story 10.4 gates still win, silently, readied or not', () => {
    for (const readied of [false, true]) {
      expect(rightPressVerdict({ ...CLEAR, readied, onCanvas: false })).toBe('ignore');
      expect(rightPressVerdict({ ...CLEAR, readied, locked: true })).toBe('ignore');
      expect(rightPressVerdict({ ...CLEAR, readied, overHotbar: true })).toBe('ignore');
    }
  });
});

describe('secondariesLevel — a ready masks the level', () => {
  it('passes the raw level through only while nothing is readied', () => {
    expect(secondariesLevel(true, false)).toBe(true);
    expect(secondariesLevel(false, false)).toBe(false);
    expect(secondariesLevel(true, true)).toBe(false);
    expect(secondariesLevel(false, true)).toBe(false);
  });
});

// --- wired: MouseInput + KeyboardInput, the prime model's own pair -----------

/** jsdom has no PointerEvent; MouseEvent stands in (mouse.test.ts's idiom). */
function fire(el: EventTarget, type: string, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
}

function rig(run: (m: MouseInput, kb: KeyboardInput, canvas: HTMLElement) => void): void {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const kb = new KeyboardInput({ isSlotFitted: () => true });
  const m = new MouseInput(undefined, undefined, undefined, undefined, {
    isReadied: () => kb.primedSlot !== SLOT_GUN,
    cancel: () => kb.revertToGun(),
  });
  m.attach(canvas);
  try {
    run(m, kb, canvas);
  } finally {
    m.detach();
    canvas.remove();
  }
}

describe('MouseInput — the right button against a readied weapon', () => {
  it('a right PRESS cancels the ready, and that press fires no secondaries', () => {
    rig((m, kb, canvas) => {
      kb.slotAction(Q); // ready the Q weapon
      expect(kb.primedSlot).toBe(Q);
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 });
      expect(kb.primedSlot).toBe(SLOT_GUN); // cancelled
      expect(m.consumeSec()).toBe(false); // …and nothing fired off that press
      expect(m.consumeSec()).toBe(false); // still held — but the press latched nothing
      fire(canvas, 'pointerup', { button: 2, buttons: 0 });
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 }); // a FRESH press
      expect(m.consumeSec()).toBe(true); // …is the secondaries again
    });
  });

  it('a right button already HELD when the weapon is readied sends no secondaries until the ready ends', () => {
    rig((m, kb, canvas) => {
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 }); // secondaries streaming
      expect(m.consumeSec()).toBe(true);
      kb.slotAction(Q); // ready a weapon with the right button still down
      expect(m.consumeSec()).toBe(false); // masked for as long as the ready lasts
      kb.revertToGun(); // the ready ends (fired or cancelled)
      expect(m.consumeSec()).toBe(true); // the held level is the secondaries again
    });
  });

  it('with nothing readied the right button is the secondaries, exactly as Story 10.4 built it', () => {
    rig((m, kb, canvas) => {
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 });
      expect(kb.primedSlot).toBe(SLOT_GUN);
      expect(m.consumeSec()).toBe(true);
      fire(canvas, 'pointerup', { button: 2, buttons: 0 });
      expect(m.consumeSec()).toBe(false);
    });
  });
});
