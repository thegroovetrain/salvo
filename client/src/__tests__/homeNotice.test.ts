// THE HOME NOTICE (Eric 2026-11-27): the status-message slot under CREATE | JOIN.
// Contracts only: the text shown is the text passed, in its tone; it clears
// after hold + fade (both read from CLIENT_CONFIG, never pinned here); a new
// message restarts the clock and no stale timer touches it; clear/dispose
// leave no timer behind. Timers run on vitest's fake clock.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import { makeHomeNotice, toneColor } from '../ui/homeNotice.js';

const HOLD = CLIENT_CONFIG.homeNoticeHoldMs;
const FADE = CLIENT_CONFIG.homeNoticeFadeMs;

describe('makeHomeNotice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts blank', () => {
    expect(makeHomeNotice().root.textContent).toBe('');
  });

  it('shows the text it was passed, in its tone, fully opaque, then fades and clears', () => {
    const n = makeHomeNotice();
    n.show('MSG-A', 'denied');
    expect(n.root.textContent).toBe('MSG-A');
    expect(n.root.style.color).toBe(toneColor('denied'));
    expect(n.root.style.opacity).toBe('1');
    vi.advanceTimersByTime(HOLD - 1);
    expect(n.root.textContent).toBe('MSG-A');
    expect(n.root.style.opacity).toBe('1');
    vi.advanceTimersByTime(1); // the hold is over: the fade begins
    expect(n.root.style.opacity).toBe('0');
    expect(n.root.style.transition).toContain(`${FADE}ms`);
    expect(n.root.textContent).toBe('MSG-A'); // still there while it fades
    vi.advanceTimersByTime(FADE);
    expect(n.root.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new message mid-hold replaces the text and restarts the clock', () => {
    const n = makeHomeNotice();
    n.show('MSG-A', 'info');
    vi.advanceTimersByTime(HOLD - 10);
    n.show('MSG-B', 'tertiary');
    expect(n.root.textContent).toBe('MSG-B');
    expect(n.root.style.color).toBe(toneColor('tertiary'));
    vi.advanceTimersByTime(HOLD - 1); // the OLD hold would have ended long ago
    expect(n.root.style.opacity).toBe('1');
    expect(n.root.textContent).toBe('MSG-B');
    vi.advanceTimersByTime(1 + FADE);
    expect(n.root.textContent).toBe('');
  });

  it('a new message mid-fade comes back fully opaque and the old fade never clears it', () => {
    const n = makeHomeNotice();
    n.show('MSG-A', 'info');
    vi.advanceTimersByTime(HOLD + FADE - 1); // one tick before A clears
    n.show('MSG-B', 'info');
    expect(n.root.style.opacity).toBe('1');
    vi.advanceTimersByTime(1);
    expect(n.root.textContent).toBe('MSG-B');
    expect(vi.getTimerCount()).toBe(1); // only B's hold is pending
  });

  it('clear() blanks it now and cancels its timer', () => {
    const n = makeHomeNotice();
    n.show('MSG-A', 'info');
    n.clear();
    expect(n.root.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dispose() cancels every pending timer, mid-hold or mid-fade', () => {
    const n = makeHomeNotice();
    n.show('MSG-A', 'info');
    n.dispose();
    expect(vi.getTimerCount()).toBe(0);
    n.show('MSG-B', 'info');
    vi.advanceTimersByTime(HOLD);
    n.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('routes its timers through an injected scheduler', () => {
    const set = vi.fn(() => 'id');
    const clear = vi.fn();
    const n = makeHomeNotice({ set, clear });
    n.show('MSG-A', 'info');
    expect(set).toHaveBeenCalledWith(expect.any(Function), HOLD);
    n.dispose();
    expect(clear).toHaveBeenCalledWith('id');
  });

  it('reserves its height whether or not it holds a message', () => {
    const n = makeHomeNotice();
    const blank = n.root.style.height;
    expect(blank).toContain('var(--hc-');
    n.show('MSG-A', 'info');
    expect(n.root.style.height).toBe(blank);
    expect(n.root.style.whiteSpace).toBe('nowrap');
  });
});
