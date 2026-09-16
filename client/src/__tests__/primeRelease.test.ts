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
//   1. input/mouse.ts    — the release EDGE exists and counts button-0 pointerups;
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
 *  PointerEvent, so MouseEvent stands in, exactly as mouse.test.ts does it. */
function fire(el: EventTarget, type: string, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
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
  /** main.ts's per-tick order, verbatim (tickPrimeEdges): the pointerdown's
   *  verdict first — arming when it predicts FIREABLE — then the release poll. */
  function tick(m: MouseInput, kb: KeyboardInput, state: { click: number; release: number }, fireable: boolean): void {
    if (m.clickCount !== state.click) {
      state.click = m.clickCount;
      if (fireable) kb.armReleaseRevert();
    }
    if (m.releaseCount !== state.release) {
      state.release = m.releaseCount;
      kb.consumeReleaseRevert();
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
    expect(fire).toContain('armReleaseRevert()');
    expect(fire).not.toContain('revertToGun()');
  });

  it('a SEPARATE release poll pays the debt, off the mouse\'s release counter', () => {
    const release = bodyOf('consumePrimeOnRelease');
    expect(release).toContain('releaseCount');
    expect(release).toContain('consumeReleaseRevert()');
  });

  it('both edges run in one tick, press first (so a fast click still reverts)', () => {
    const edges = bodyOf('tickPrimeEdges');
    expect(edges.indexOf('consumePrimeOnFire')).toBeGreaterThan(-1);
    expect(edges.indexOf('consumePrimeOnRelease')).toBeGreaterThan(
      edges.indexOf('consumePrimeOnFire'),
    );
  });

  it('the HARD boundaries still revert outright (they end a life, not a hold)', () => {
    // The sinking window's hygiene and the room's resetPrime must not become
    // debts: a prime owed at release would otherwise fire into the next life.
    expect(MAIN_TS).toContain('resetPrime: () => g.keyboard.revertToGun()');
    expect(bodyOf('tickSinkingWindow')).toContain('revertToGun()');
  });
});
