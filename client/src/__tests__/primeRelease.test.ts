// THE RELEASE-DEFERRED PRIME REVERT (Story 8.5, orchestrator ruling 9 /
// UX-DR42: *"firing auto-reverts on RELEASE, never on press"*).
//
// The shipped behaviour reverted the prime at POINTERDOWN, which is wrong for a
// held stream: Story 8.14's machine gun has to keep its prime for the whole
// hold, and a press-time revert drops it to the gun on the first frame. The
// revert moved to the matching pointerup. What did NOT move is the DECISION:
// `shouldConsumePrime` is still evaluated at pointerdown, where the fire input
// and its D1 fire-time stamp are built, and it now ARMS a debt the release pays.
//
// THREE LAYERS, PINNED SEPARATELY, because the bug this guards against can be
// reintroduced at any one of them:
//   1. input/mouse.ts    — the release EDGE exists, and each release names the
//      CLICK it closed (pointer-paired, blur/pointercancel included);
//   2. input/keyboard.ts — arm/consume semantics, and "any prime change wins";
//   3. client/src/main.ts — the WIRING: the pointerdown site arms rather than
//      reverts, and a separate release poll pays it.
//
// Layer 3 is a SOURCE SCAN (the idiom this suite shares with
// ordnanceMasksAreServerOnly.test.ts and noDrawPileCounter.test.ts) for the same
// reason those are: main.ts is the composition root and cannot be instantiated
// in jsdom, but "which function the fire path calls" is decidable from the text,
// and a reader who moves `revertToGun()` back to the pointerdown site is exactly
// what must fail here. The behavioural halves above stay honest on their own.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOT_GUN, WEAPON_SLOTS } from '@salvo/shared';
import { MouseInput } from '../input/mouse.js';
import { KeyboardInput } from '../input/keyboard.js';

const [Q, E] = WEAPON_SLOTS;

/** Every slot from the boost up through the weapon row is fitted (the fitted
 *  hook FAILS CLOSED, so it must be wired for any prime to happen at all). */
const ALL_FITTED = (slot: number): boolean => slot >= 1 && slot <= WEAPON_SLOTS[2];

/** Dispatch a pointer-ish event ON `el` (bubbles to the window listener with
 *  e.target === el — the browser's canvas-click shape). jsdom has no
 *  PointerEvent, so MouseEvent stands in, exactly as mouse.test.ts does it —
 *  with `pointerId` grafted on when a test needs to tell two pointers apart
 *  (jsdom's MouseEvent constructor drops the field, so it is defined by hand). */
function fire(el: EventTarget, type: string, init: MouseEventInit & { pointerId?: number } = {}): void {
  const { pointerId, ...rest } = init;
  const e = new MouseEvent(type, { bubbles: true, ...rest });
  if (pointerId !== undefined) Object.defineProperty(e, 'pointerId', { value: pointerId });
  el.dispatchEvent(e);
}

function withMouse(run: (m: MouseInput, canvas: HTMLElement) => void): void {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const m = new MouseInput();
  m.attach(canvas);
  try {
    run(m, canvas);
  } finally {
    m.detach();
    canvas.remove();
  }
}

// --- layer 1: the release edge exists on the mouse adapter -------------------

describe('MouseInput.releaseCount — the click counter\'s twin', () => {
  it('counts button-0 pointerups, cumulatively, starting at zero', () => {
    withMouse((m, canvas) => {
      expect(m.releaseCount).toBe(0);
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.releaseCount).toBe(0); // the press is not the release
      fire(canvas, 'pointerup', { button: 0 });
      expect(m.releaseCount).toBe(1);
      fire(canvas, 'pointerdown', { button: 0 });
      fire(canvas, 'pointerup', { button: 0 });
      expect(m.releaseCount).toBe(2);
      expect(m.clickCount).toBe(2); // the two counters advance independently
    });
  });

  it('ignores the other buttons — only the trigger has a hold to end', () => {
    withMouse((m, canvas) => {
      fire(canvas, 'pointerup', { button: 1 });
      fire(canvas, 'pointerup', { button: 2 });
      expect(m.releaseCount).toBe(0);
    });
  });

  it('counts a release that lands OFF the canvas — the button is up either way', () => {
    // Deliberately NOT canvas-target-only, unlike the click it closes. Press on
    // the water, drag over a piece of DOM chrome, let go: the hold is over, and
    // a prime armed for it must not stay armed forever.
    withMouse((m, canvas) => {
      const chrome = document.createElement('button');
      document.body.appendChild(chrome);
      fire(canvas, 'pointerdown', { button: 0 });
      fire(chrome, 'pointerup', { button: 0 });
      expect(m.releaseCount).toBe(1);
      chrome.remove();
    });
  });

  it('stops counting once detached (no listener outlives the adapter)', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const m = new MouseInput();
    m.attach(canvas);
    fire(canvas, 'pointerup', { button: 0 });
    m.detach();
    fire(canvas, 'pointerup', { button: 0 });
    expect(m.releaseCount).toBe(1);
    canvas.remove();
  });
});

// --- layer 2: the two adapters driven together, as main.ts drives them -------

describe('the press/release pair over a real click (mouse + keyboard)', () => {
  /** main.ts's per-tick order, verbatim: the RELEASE edge first (paying the
   *  debt of whichever click's hold has ended), then the pointerdown's verdict
   *  — arming when it predicts FIREABLE, and settling on the spot a tap whose
   *  release already landed inside this same tick. */
  function tick(m: MouseInput, kb: KeyboardInput, state: { click: number; release: number }, fireable: boolean): void {
    if (m.releasedClickSeq !== state.release) {
      state.release = m.releasedClickSeq;
      kb.consumeReleaseRevert(state.release);
    }
    if (m.clickCount !== state.click) {
      state.click = m.clickCount;
      if (!fireable) return;
      kb.armReleaseRevert(m.clickCount);
      if (m.releasedClickSeq === m.clickCount) kb.consumeReleaseRevert(m.clickCount);
    }
  }

  it('a HELD fireable click keeps the prime for the whole hold, then reverts', () => {
    withMouse((m, canvas) => {
      const kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
      kb.attach();
      const seen = { click: 0, release: 0 };
      kb.slotAction(Q); // prime the weapon in Q
      fire(canvas, 'pointerdown', { button: 0 });
      tick(m, kb, seen, true); // the tick the shot goes out on
      expect(kb.primedSlot).toBe(Q); // …still primed, mid-hold
      tick(m, kb, seen, true); // …and for every tick the button stays down
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(Q);
      fire(canvas, 'pointerup', { button: 0 });
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(SLOT_GUN); // the RELEASE is the revert
      kb.detach();
    });
  });

  it('a press and its release inside ONE tick still revert (an ordinary fast click)', () => {
    withMouse((m, canvas) => {
      const kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
      kb.attach();
      const seen = { click: 0, release: 0 };
      kb.slotAction(Q);
      fire(canvas, 'pointerdown', { button: 0 });
      fire(canvas, 'pointerup', { button: 0 }); // both edges in one 50ms window
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(SLOT_GUN);
      kb.detach();
    });
  });

  it('a weapon key pressed mid-hold WINS: the switched prime survives the release', () => {
    withMouse((m, canvas) => {
      const kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
      kb.attach();
      const seen = { click: 0, release: 0 };
      kb.slotAction(Q);
      fire(canvas, 'pointerdown', { button: 0 });
      tick(m, kb, seen, true);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); // switch mid-hold
      expect(kb.primedSlot).toBe(E);
      fire(canvas, 'pointerup', { button: 0 });
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(E); // NOT the gun — the key won
      kb.detach();
    });
  });

  it('a DENIED click arms nothing, so its release leaves the prime alone', () => {
    withMouse((m, canvas) => {
      const kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
      kb.attach();
      const seen = { click: 0, release: 0 };
      kb.slotAction(Q);
      fire(canvas, 'pointerdown', { button: 0 });
      tick(m, kb, seen, false); // predicted denied: reloading / out of arc
      fire(canvas, 'pointerup', { button: 0 });
      tick(m, kb, seen, false);
      expect(kb.primedSlot).toBe(Q); // the prime survives a denial, as ever
      kb.detach();
    });
  });
});

// --- layer 3: main.ts really wires it that way -------------------------------

const MAIN_TS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../main.ts'),
  'utf8',
);

/** The body of a named top-level function in main.ts, for a scoped scan. */
function bodyOf(name: string): string {
  const start = MAIN_TS.indexOf(`function ${name}(`);
  expect(start, `main.ts must declare ${name}`).toBeGreaterThan(-1);
  const open = MAIN_TS.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < MAIN_TS.length; i += 1) {
    if (MAIN_TS[i] === '{') depth += 1;
    else if (MAIN_TS[i] === '}') {
      depth -= 1;
      if (depth === 0) return MAIN_TS.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

describe('main.ts wires the revert to the RELEASE, not the press', () => {
  it('the pointerdown site ARMS the revert and never performs it', () => {
    // THE FAIL-FIRST: move `revertToGun()` back onto the shouldConsumePrime
    // branch and this fails on the spot. The predicate itself stays where it is
    // — the fire input and the D1 fire-time stamp are built around it.
    const fire = bodyOf('consumePrimeOnFire');
    expect(fire).toContain('shouldConsumePrime(');
    expect(fire).toContain('armPrimeRevert(g, clickSeq)');
    expect(fire).not.toContain('revertToGun()');
  });

  it('the arm NAMES ITS CLICK, and settles a tap released inside the same tick', () => {
    const arm = bodyOf('armPrimeRevert');
    expect(arm).toContain('armReleaseRevert(clickSeq)');
    expect(arm).toContain('releasedClickSeq === clickSeq');
    expect(arm).toContain('consumeReleaseRevert(clickSeq)');
  });

  it('a SEPARATE release poll pays the debt, off the RELEASED CLICK\'S seq', () => {
    // Not a release COUNT: the seq is what makes "this release belongs to that
    // click" decidable, and every one of the three defects above turned on it.
    const release = bodyOf('consumePrimeOnRelease');
    expect(release).toContain('releasedClickSeq');
    expect(release).toContain('consumeReleaseRevert(releasedSeq)');
    expect(release).not.toContain('releaseCount');
  });

  it('the tick runs RELEASE → wire slot → PRESS (a fast double-click fires the gun)', () => {
    // THE ORDER IS THE FIX. With the press edge first, up(A) and down(B) inside
    // one 50ms tick built B's input off the weapon A had just spent.
    const tick = bodyOf('makeCallbacks');
    const release = tick.indexOf('consumePrimeOnRelease(g)');
    const wireSlot = tick.indexOf('const primedSlot = g.keyboard.primedSlot');
    const press = tick.indexOf('consumePrimeOnFire(g,');
    expect(release).toBeGreaterThan(-1);
    expect(wireSlot).toBeGreaterThan(release);
    expect(press).toBeGreaterThan(wireSlot);
  });

  it('the HARD boundaries still revert outright (they end a life, not a hold)', () => {
    // The sinking window's hygiene and the room's resetPrime must not become
    // debts: a prime owed at release would otherwise fire into the next life.
    expect(MAIN_TS).toContain('resetPrime: () => g.keyboard.revertToGun()');
    expect(bodyOf('tickSinkingWindow')).toContain('revertToGun()');
  });
});

// --- the review fix: a release belongs to the CLICK it closes ----------------
//
// Three defects the counter-only shape carried, all fixed by pairing each
// release with its click's sequence number (and by running the release edge
// BEFORE the tick's fire input is built):
//
//   1. WITHIN-TICK ORDER WAS LOST. A pointerup of click A and the pointerdown of
//      click B land in the same 50ms tick; the tick built B's input off the
//      still-primed weapon and only then paid A's release, so an ordinary fast
//      double-click after a torpedo shot fired the TORPEDO twice.
//   2. A LOST POINTERUP LEFT A STALE LATCH. A window blur mid-hold (or a
//      pointercancel from touch/pen) never counted as a release, and the debt
//      sat there for the next unrelated pointerup to pay.
//   3. A DIFFERENT POINTER'S RELEASE PAID IT. Pointer A holds a fireable click,
//      pointer B lets go on some chrome, and B's up reverted A's prime.

describe('MouseInput pairs each release with the click it closes', () => {
  it('reports the RELEASED CLICK\'S seq, not a bare count', () => {
    withMouse((m, canvas) => {
      expect(m.releasedClickSeq).toBe(0); // 0 = nothing has been let go of yet
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.releasedClickSeq).toBe(0); // …still held
      fire(canvas, 'pointerup', { button: 0 });
      expect(m.releasedClickSeq).toBe(1); // click #1 is the one that ended
      fire(canvas, 'pointerdown', { button: 0 });
      fire(canvas, 'pointerup', { button: 0 });
      expect(m.releasedClickSeq).toBe(2);
    });
  });

  it('a DIFFERENT pointer\'s release never closes the active hold (defect 3)', () => {
    withMouse((m, canvas) => {
      const chrome = document.createElement('button');
      document.body.appendChild(chrome);
      fire(canvas, 'pointerdown', { button: 0, pointerId: 1 });
      fire(chrome, 'pointerup', { button: 0, pointerId: 2 });
      expect(m.releasedClickSeq).toBe(0); // pointer 2 does not speak for pointer 1
      fire(chrome, 'pointerup', { button: 0, pointerId: 1 });
      expect(m.releasedClickSeq).toBe(1); // …its OWN pointer does, wherever it lands
      chrome.remove();
    });
  });

  it('a window BLUR ends the hold — the lost pointerup case (defect 2)', () => {
    withMouse((m, canvas) => {
      fire(canvas, 'pointerdown', { button: 0 });
      window.dispatchEvent(new Event('blur'));
      expect(m.releasedClickSeq).toBe(1);
    });
  });

  it('POINTERCANCEL (touch/pen) ends the hold too (defect 2)', () => {
    withMouse((m, canvas) => {
      fire(canvas, 'pointerdown', { button: 0, pointerId: 7 });
      fire(canvas, 'pointercancel', { pointerId: 7 });
      expect(m.releasedClickSeq).toBe(1);
    });
  });

  it('a SWALLOWED press (DOM chrome) never becomes a hold, so its up closes nothing', () => {
    withMouse((m) => {
      const chrome = document.createElement('button');
      document.body.appendChild(chrome);
      fire(chrome, 'pointerdown', { button: 0 }); // not the canvas: no click, no hold
      fire(chrome, 'pointerup', { button: 0 });
      expect(m.clickCount).toBe(0);
      expect(m.releasedClickSeq).toBe(0);
      chrome.remove();
    });
  });
});

describe('the tick, in main.ts\'s order: release edge → wire slot → press edge', () => {
  /**
   * main.ts's simTick, modelled exactly (and pinned to the source by the scan
   * at the bottom of this file): the RELEASE edge runs FIRST, then the wire
   * slot is read for this tick's fire input, then the PRESS edge arms — paying
   * at once if the mouse already reports this very click released (the
   * down-and-up-inside-one-tick tap). Returns the slot the input carried.
   */
  function tick(
    m: MouseInput,
    kb: KeyboardInput,
    seen: { click: number; release: number },
    fireable: boolean,
  ): number {
    const released = m.releasedClickSeq;
    if (released !== seen.release) {
      seen.release = released;
      kb.consumeReleaseRevert(released);
    }
    const wireSlot = kb.primedSlot; // `const primedSlot = g.keyboard.primedSlot`
    const clickSeq = m.clickCount;
    if (clickSeq !== seen.click) {
      seen.click = clickSeq;
      if (fireable) {
        kb.armReleaseRevert(clickSeq);
        if (m.releasedClickSeq === clickSeq) kb.consumeReleaseRevert(clickSeq);
      }
    }
    return wireSlot;
  }

  function primed(): KeyboardInput {
    const kb = new KeyboardInput({ isSlotFitted: ALL_FITTED });
    kb.attach();
    kb.slotAction(Q); // the torpedo is primed
    return kb;
  }

  it('up(A) then down(B) in ONE tick: B is the GUN\'S click, not a second torpedo (defect 1)', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0 }); // click A, on the torpedo
      expect(tick(m, kb, seen, true)).toBe(Q); // …which is what A's input carries
      fire(canvas, 'pointerup', { button: 0 }); // A ends…
      fire(canvas, 'pointerdown', { button: 0 }); // …and B begins, same 50ms window
      expect(tick(m, kb, seen, true)).toBe(SLOT_GUN); // B fires the GUN
      expect(kb.primedSlot).toBe(SLOT_GUN);
      kb.detach();
    });
  });

  it('a press and its release inside one tick still revert (the fast tap, unchanged)', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0 });
      fire(canvas, 'pointerup', { button: 0 });
      expect(tick(m, kb, seen, true)).toBe(Q); // the shot still went out on the torpedo…
      expect(kb.primedSlot).toBe(SLOT_GUN); // …and the release paid, same tick
      kb.detach();
    });
  });

  it('pointer 2\'s release does not pay pointer 1\'s debt (defect 3, end to end)', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0, pointerId: 1 });
      tick(m, kb, seen, true);
      fire(canvas, 'pointerup', { button: 0, pointerId: 2 });
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(Q); // pointer 1 is still holding the trigger
      fire(canvas, 'pointerup', { button: 0, pointerId: 1 });
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(SLOT_GUN);
      kb.detach();
    });
  });

  it('BLUR mid-hold pays the debt — no stale latch survives it (defect 2)', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0 });
      tick(m, kb, seen, true);
      window.dispatchEvent(new Event('blur')); // alt-tab mid-hold
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(SLOT_GUN);
      kb.detach();
    });
  });

  it('POINTERCANCEL mid-hold pays it too (defect 2)', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0, pointerId: 7 });
      tick(m, kb, seen, true);
      fire(canvas, 'pointercancel', { pointerId: 7 });
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(SLOT_GUN);
      kb.detach();
    });
  });

  it('a DENIED click arms nothing, and no later release can pay for it', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0 });
      tick(m, kb, seen, false); // predicted denied: reloading / out of arc
      fire(canvas, 'pointerup', { button: 0 });
      tick(m, kb, seen, false);
      expect(kb.primedSlot).toBe(Q);
      fire(canvas, 'pointerup', { button: 0 }); // a stray up with no click behind it
      tick(m, kb, seen, false);
      expect(kb.primedSlot).toBe(Q); // …pays nothing either
      kb.detach();
    });
  });

  // --- Story 8.7, ruling 9: the refit window ends the stream -----------------
  //
  // The window is a full combat lockout, but the lockout only ever gated the
  // PRESS. A hold that was already running kept its debt standing behind the
  // window — and the pointerup that would have paid it might land after the
  // player has closed the window, switched weapons, or died. main.ts's
  // visibility watcher calls `endHolds()` on the OPEN edge; from the tick's
  // point of view that is simply the hold ending, which is exactly right.

  it('opening the refit window ends the hold and PAYS the owed revert', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0 });
      expect(tick(m, kb, seen, true)).toBe(Q); // the shot goes out, the debt is armed
      expect(kb.releaseRevertPending).toBe(true);
      m.endHolds(); // TAB — the watcher's false→true edge
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(SLOT_GUN); // the stream is over, the prime reverted
      expect(kb.releaseRevertPending).toBe(false);
      kb.detach();
    });
  });

  it('the stream does not RESUME when the window closes without a fresh press', () => {
    withMouse((m, canvas) => {
      const kb = primed();
      const seen = { click: 0, release: 0 };
      fire(canvas, 'pointerdown', { button: 0 });
      tick(m, kb, seen, true);
      m.endHolds(); // the window opened…
      tick(m, kb, seen, true);
      const clicks = m.clickCount;
      // …the player closes it still holding the button, and ticks on. A held
      // button that never came up is not a new press: the counter stands still.
      tick(m, kb, seen, true);
      tick(m, kb, seen, true);
      expect(m.clickCount).toBe(clicks);
      // The late pointerup closes nothing and pays nothing.
      fire(canvas, 'pointerup', { button: 0 });
      kb.slotAction(Q); // re-prime after the revert above
      tick(m, kb, seen, true);
      expect(kb.primedSlot).toBe(Q);
      kb.detach();
    });
  });

  it('an already-QUEUED ability press survives the open — a press is a press', () => {
    withMouse((m, canvas) => {
      const kb = new KeyboardInput({ isSlotFitted: ALL_FITTED, isAbilitySlot: (s) => s === 1 });
      kb.attach();
      kb.slotAction(1); // the boost — queued, not yet consumed onto the wire
      fire(canvas, 'pointerdown', { button: 0 });
      expect(kb.pendingActivationCount).toBe(1);
      m.endHolds(); // the window opens over it
      expect(kb.pendingActivationCount).toBe(1); // the queue is NOT cleared
      kb.consumeActivation();
      expect(kb.actSeq).toBe(1); // …and it still rides an input
      expect(kb.actSlot).toBe(1);
      kb.detach();
    });
  });
});
