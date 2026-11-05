// THE RIGHT BUTTON WITH A READIED WEAPON (Story 10.5, 2026-11-05, epic-10
// amendment 11 — orchestrator ruling B). The pure decision
// (input/rightClick.ts) and its wiring through the real MouseInput +
// KeyboardInput pair (the prime model is the keyboard's): a right PRESS with a
// weapon readied cancels the ready and fires NO secondaries; a right button
// already held when a weapon is readied keeps firing until released
// (amendment 11(r)); with nothing readied the right button is Story 10.4's
// secondaries, untouched.

import { describe, it, expect } from 'vitest';
import { SLOT_GUN, WEAPON_SLOTS } from '@salvo/shared';
import { rightPressVerdict, type RightPressFacts } from '../input/rightClick.js';
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

  it('a right button already HELD keeps firing through a ready, the shot, and the ready ending', () => {
    rig((m, kb, canvas) => {
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 }); // secondaries streaming
      expect(m.consumeSec()).toBe(true);
      kb.slotAction(Q); // ready a weapon with the right button still down
      expect(kb.primedSlot).toBe(Q);
      expect(m.consumeSec()).toBe(true); // never interrupted
      const clicks = m.clickCount;
      fire(canvas, 'pointermove', { button: 0, buttons: 3 }); // left chord press: fire the weapon
      expect(m.clickCount).toBeGreaterThan(clicks);
      expect(m.consumeSec()).toBe(true); // …on the very tick the weapon fires
      fire(canvas, 'pointermove', { button: 0, buttons: 2 }); // left chord release
      kb.revertToGun(); // the ready ends
      expect(m.consumeSec()).toBe(true);
      fire(canvas, 'pointerup', { button: 2, buttons: 0 });
      expect(m.consumeSec()).toBe(false); // a normal release ends it
    });
  });

  it('released while readied: the next right press only cancels; a fresh press with nothing readied fires again', () => {
    rig((m, kb, canvas) => {
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 });
      kb.slotAction(Q);
      expect(m.consumeSec()).toBe(true);
      fire(canvas, 'pointerup', { button: 2, buttons: 0 }); // let go while readied
      expect(m.consumeSec()).toBe(false);
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 }); // press again, still readied
      expect(kb.primedSlot).toBe(SLOT_GUN); // that press cancelled the ready
      expect(m.consumeSec()).toBe(false); // …and armed nothing
      expect(m.consumeSec()).toBe(false); // still down, still nothing
      fire(canvas, 'pointerup', { button: 2, buttons: 0 });
      fire(canvas, 'pointerdown', { button: 2, buttons: 2 }); // fresh press, nothing readied
      expect(m.consumeSec()).toBe(true);
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
