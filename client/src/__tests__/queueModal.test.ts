// THE QUEUE MODAL (Eric ruling 2026-08-18: *"i want the queue to open up as a
// modal or something."*)
//
// Two things are load-bearing enough to be pinned hard here, because both are
// rulings rather than taste. FIRST, THE COPY IS EXACTLY THREE STRINGS — `N/20
// QUEUED`, `STARTS IN m:ss` and `CANCEL` — and nothing else may appear: the pass
// before this one invented wording Eric never asked for, so there is a test below
// that enumerates the rendered text and refuses anything outside that set.
// SECOND, AN UNARMED POOL SHOWS NO COUNTDOWN AT ALL (epic-6 amendment 4): a
// deadline that cannot fire is not a deadline.
//
// The lifecycle pins are about a leak: the 1Hz interval closes over module state
// and must not survive ANY close path.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QueueStatusMsg } from '@salvo/shared';
import {
  countdownMmSs,
  hideQueueModal,
  queueArmed,
  queueCountdownLine,
  queueDeadlineAt,
  queuedCountLine,
  queueModalVisible,
  showQueueModal,
  updateQueueModal,
} from '../ui/queueModal.js';

function status(over: Partial<QueueStatusMsg> = {}): QueueStatusMsg {
  return { n: 1, min: 2, cap: 20, startsInMs: null, ...over };
}

function modal(): HTMLElement | null {
  return document.getElementById('queue-modal');
}

function panel(): HTMLElement {
  return modal()?.firstElementChild as HTMLElement;
}

function countEl(): HTMLElement {
  return panel().children[0] as HTMLElement;
}

function countdownEl(): HTMLElement {
  return panel().children[1] as HTMLElement;
}

function cancelBtn(): HTMLButtonElement {
  return document.getElementById('queue-modal-cancel') as HTMLButtonElement;
}

afterEach(() => {
  hideQueueModal();
  document.getElementById('queue-modal')?.remove();
  vi.useRealTimers();
});

// --- pure copy ----------------------------------------------------------------

describe('queuedCountLine — Eric copy, verbatim', () => {
  it("is `N/20 QUEUED` and nothing else", () => {
    expect(queuedCountLine(0, 20)).toBe('0/20 QUEUED');
    expect(queuedCountLine(7, 20)).toBe('7/20 QUEUED');
    expect(queuedCountLine(20, 20)).toBe('20/20 QUEUED');
  });

  it('takes the cap from its ARGUMENT, so a playerCap retune moves it', () => {
    expect(queuedCountLine(3, 12)).toBe('3/12 QUEUED');
  });

  it('carries no threshold, no state word and no clock', () => {
    const line = queuedCountLine(1, 20);
    expect(line).not.toMatch(/NEEDS|STARTING|STARTS|\d:\d\d/);
    expect(line).not.toContain('·');
  });
});

describe('countdownMmSs — the chrome-bar countdown grammar', () => {
  it('CEILS, so it never reads 0:00 while time remains', () => {
    expect(countdownMmSs(120_000)).toBe('2:00');
    expect(countdownMmSs(65_000)).toBe('1:05');
    expect(countdownMmSs(1)).toBe('0:01');
    expect(countdownMmSs(0)).toBe('0:00');
  });

  it('clamps a passed deadline rather than printing a negative clock', () => {
    expect(countdownMmSs(-500)).toBe('0:00');
    expect(countdownMmSs(-90_000)).toBe('0:00');
  });
});

describe('queueArmed / queueDeadlineAt — a deadline that CAN fire', () => {
  it('needs BOTH a numeric startsInMs and a pool at or above min', () => {
    expect(queueArmed(status({ n: 2, startsInMs: 30_000 }))).toBe(true);
    expect(queueArmed(status({ n: 7, startsInMs: 30_000 }))).toBe(true);
    expect(queueArmed(status({ n: 1, startsInMs: null }))).toBe(false);
    expect(queueArmed(status({ n: 2, startsInMs: null }))).toBe(false); // forming
    expect(queueArmed(status({ n: 1, startsInMs: 30_000 }))).toBe(false); // below min
  });

  it('FAILS SAFE when a server omits startsInMs entirely — never NaN', () => {
    const bogus = { n: 4, min: 2, cap: 20 } as unknown as QueueStatusMsg;
    expect(queueArmed(bogus)).toBe(false);
    expect(queueDeadlineAt(bogus, 1_000_000)).toBeNull();
  });

  it('converts the RELATIVE push into an absolute client-epoch instant, once', () => {
    expect(queueDeadlineAt(status({ n: 4, startsInMs: 83_000 }), 1_000_000)).toBe(1_083_000);
    expect(queueDeadlineAt(status({ n: 1, startsInMs: null }), 1_000_000)).toBeNull();
  });
});

describe('queueCountdownLine — amendment 4, no clock that cannot fire', () => {
  it('is `STARTS IN m:ss` while armed', () => {
    expect(queueCountdownLine(true, 1_083_000, 1_000_000)).toBe('STARTS IN 1:23');
  });

  it('is the EMPTY STRING while unarmed — not `0:00`, not a placeholder', () => {
    expect(queueCountdownLine(false, 0, 1_000_000)).toBe('');
    expect(queueCountdownLine(false, 1_083_000, 1_000_000)).toBe('');
  });
});

// --- DOM ----------------------------------------------------------------------

describe('showQueueModal — the surface, and ONLY the copy Eric asked for', () => {
  beforeEach(() => hideQueueModal());

  it('opens over the home at z 1150 — above home (1100), below the class bay (1200)', () => {
    showQueueModal(vi.fn());
    const el = modal() as HTMLElement;
    expect(el.style.zIndex).toBe('1150');
    expect(el.style.position).toBe('fixed');
    expect(el.style.inset).toBe('0px'); // hit-tests every pixel: home is unclickable
    // No fullscreen dim (ui/settings.ts's precedent) — the ambient keeps breathing.
    expect(el.style.backgroundColor).toBe('transparent');
  });

  it('the panel wears the hairline outline as SEPARATE properties, never a slab', () => {
    // A `border:1px solid var(--x)` shorthand is silently rejected whole by the
    // test environment's CSSOM parser — see the hazard note in queueModal.ts.
    showQueueModal(vi.fn());
    expect(panel().style.borderWidth).toBe('1px');
    expect(panel().style.borderStyle).toBe('solid');
    expect(panel().style.borderColor).toBe('var(--hc-hairline)');
    expect(panel().style.backgroundColor).toBe('var(--hc-panel)');
    expect(panel().style.boxSizing).toBe('border-box'); // amendment 47
    expect(cancelBtn().style.backgroundColor).toBe('transparent');
  });

  it('carries NOTHING but the count, the countdown slot and CANCEL', () => {
    // The hard guard against invented copy. Enumerate every rendered string and
    // refuse anything outside the ruled set — no title, no prose, no reassurance,
    // and specifically nothing about a lobby collapse.
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 4, min: 2, cap: 20, startsInMs: 83_000 }));
    expect(panel().children.length).toBe(3);
    const text = (modal()?.textContent ?? '').replace(/\u00A0/g, '');
    expect(text).toBe('4/20 QUEUEDSTARTS IN 1:23CANCEL');
    expect(text).not.toMatch(/NEEDS|STARTING|DISBANDED|SEARCHING|WAITING|CAPTAIN|PLEASE|SOON/);
  });

  it('opens EMPTY and holds both slots, since nothing is known until the first push', () => {
    showQueueModal(vi.fn());
    for (const el of [countEl(), countdownEl()]) {
      expect(el.style.visibility).toBe('hidden');
      expect(el.textContent).not.toBe(''); // the box is reserved, one line tall
    }
  });

  it('is styled through tokens only — no colour literals anywhere', () => {
    showQueueModal(vi.fn());
    const css = [modal(), panel(), countEl(), countdownEl(), cancelBtn()]
      .map((el) => (el as HTMLElement).getAttribute('style') ?? '')
      .join(';');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).toMatch(/var\(--hc-panel\)/);
    expect(css).toMatch(/var\(--hc-denied\)/);
  });
});

describe('updateQueueModal — the live MSG.queueStatus push', () => {
  beforeEach(() => hideQueueModal());

  it('paints the count on every push', () => {
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 1 }));
    expect(countEl().textContent).toBe('1/20 QUEUED');
    updateQueueModal(status({ n: 6 }));
    expect(countEl().textContent).toBe('6/20 QUEUED');
  });

  it('SHOWS NOTHING in the countdown slot while unarmed (amendment 4)', () => {
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 1, startsInMs: null }));
    expect(countdownEl().style.visibility).toBe('hidden');
    expect(countdownEl().textContent).not.toMatch(/\d/); // no digits at all
    // ...and the same for a full pool being seated, which has no deadline either.
    updateQueueModal(status({ n: 20, startsInMs: null }));
    expect(countdownEl().style.visibility).toBe('hidden');
    // ...and for the impossible armed-below-min payload a foreign server might send.
    updateQueueModal(status({ n: 1, startsInMs: 83_000 }));
    expect(countdownEl().style.visibility).toBe('hidden');
  });

  it('counts down at 1Hz off the absolute deadline once ARMED', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 4, startsInMs: 83_000 }));
    expect(countdownEl().textContent).toBe('STARTS IN 1:23');
    vi.advanceTimersByTime(3000); // no new push — the local clock alone moves it
    expect(countdownEl().textContent).toBe('STARTS IN 1:20');
    vi.advanceTimersByTime(60_000); // 83s − 3s − 60s
    expect(countdownEl().textContent).toBe('STARTS IN 0:20');
  });

  it('clamps at 0:00 rather than going negative past the deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 4, startsInMs: 5000 }));
    vi.advanceTimersByTime(30_000);
    expect(countdownEl().textContent).toBe('STARTS IN 0:00');
  });

  it('runs NO timer while unarmed, and stops one when a pool un-arms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const spy = vi.spyOn(globalThis, 'clearInterval');
    showQueueModal(vi.fn());
    const started = vi.spyOn(globalThis, 'setInterval');
    updateQueueModal(status({ n: 1, startsInMs: null }));
    expect(started).not.toHaveBeenCalled();
    updateQueueModal(status({ n: 4, startsInMs: 83_000 }));
    expect(started).toHaveBeenCalledTimes(1);
    updateQueueModal(status({ n: 20, startsInMs: null })); // the forming window
    expect(spy).toHaveBeenCalled();
    started.mockRestore();
    spy.mockRestore();
  });

  it('is a NO-OP with no modal up, so a late push cannot resurrect one', () => {
    expect(queueModalVisible()).toBe(false);
    updateQueueModal(status({ n: 4, startsInMs: 83_000 }));
    expect(modal()).toBeNull();
  });
});

describe('CANCEL and teardown — the tick may not outlive any close path', () => {
  beforeEach(() => hideQueueModal());

  it('CANCEL closes the modal and then fires the canceller', () => {
    const cancel = vi.fn();
    showQueueModal(cancel);
    cancelBtn().click();
    expect(modal()).toBeNull();
    expect(queueModalVisible()).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('CANCEL is a real button — Tab reaches it, and it is NOT autofocused', () => {
    // Enter is the deploy key; autofocusing CANCEL would let a late Enter throw
    // away the wait it just started.
    showQueueModal(vi.fn());
    expect(cancelBtn().tagName).toBe('BUTTON');
    expect(cancelBtn().type).toBe('button');
    expect(document.activeElement).not.toBe(cancelBtn());
  });

  it('clears the 1Hz tick on the CANCEL path', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 4, startsInMs: 83_000 }));
    const el = countdownEl();
    cancelBtn().click();
    const before = el.textContent;
    vi.advanceTimersByTime(30_000); // a detached node must never be repainted
    expect(el.textContent).toBe(before);
  });

  it('clears the 1Hz tick on the hideQueueModal path (seat arrived, or a failure)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 4, startsInMs: 83_000 }));
    const el = countdownEl();
    hideQueueModal();
    const before = el.textContent;
    vi.advanceTimersByTime(30_000);
    expect(el.textContent).toBe(before);
    expect(modal()).toBeNull();
  });

  it('hideQueueModal is idempotent — every close path may call it', () => {
    showQueueModal(vi.fn());
    hideQueueModal();
    expect(() => hideQueueModal()).not.toThrow();
    expect(modal()).toBeNull();
  });

  it('a re-open never stacks a second overlay, and never leaks the first tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const clear = vi.spyOn(globalThis, 'clearInterval');
    showQueueModal(vi.fn());
    updateQueueModal(status({ n: 4, startsInMs: 83_000 }));
    showQueueModal(vi.fn());
    expect(document.querySelectorAll('#queue-modal').length).toBe(1);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });

  it('the second canceller is the one that fires after a re-open', () => {
    const first = vi.fn();
    const second = vi.fn();
    showQueueModal(first);
    showQueueModal(second);
    cancelBtn().click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
