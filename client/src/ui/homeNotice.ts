// THE HOME NOTICE (Eric 2026-11-27): the home's one status-message register,
// a single centered line in the empty space directly under CREATE | JOIN.
//
// It took the job the top-left `SERVER: …` line used to share. That line was the
// server probe's AND the connect flow's, so CONNECTING…, a connect failure, the
// session-busy refusal, a private-lobby error and the resume failure all turned
// the server readout into a message. Now every one of those lands here, and the
// top-left is the server icon alone (ui/serverStatus.ts). The queue writes
// nothing here — its wait is the queue modal's (ui/queueModal.ts).
//
// A message shows at full opacity for `CLIENT_CONFIG.homeNoticeHoldMs`, fades
// over `homeNoticeFadeMs` (a CSS opacity transition), and is then cleared. A new
// message replaces the current one and restarts the clock; the old timers are
// cancelled first, so a stale timer can never clear the new text.
//
// THE SLOT IS ALWAYS RESERVED: a fixed height (`--hc-home-notice`, ui/homeBars.ts
// SIZES, normal + short window) and a single nowrap line (ellipsized past the
// console row's width), so nothing on the home
// moves when a message appears or clears. In flow — no absolute positioning.
//
// The timers go through an injected `NoticeScheduler` so tests can drive them;
// `dispose()` cancels both, and home.ts calls it from `hide()` and before a
// re-mount, so no timer outlives its home.

import { CLIENT_CONFIG } from '../config.js';
import { BAR_TEXT_CSS } from './homeBars.js';

export type StatusTone = 'info' | 'denied' | 'tertiary';
export interface StatusLine {
  text: string;
  tone: StatusTone;
}

/** A message tone's color token. */
export function toneColor(tone: StatusTone): string {
  if (tone === 'info') return 'var(--hc-info)';
  if (tone === 'denied') return 'var(--hc-denied)';
  // Story 2.3 (amendment 17): the quiet tone is a SYSTEM line, not decoration —
  // it reads phosphor, never the retired grey.
  return 'var(--hc-phosphor)';
}

/** The timer seam (window.setTimeout / clearTimeout by default). */
export interface NoticeScheduler {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

const WINDOW_SCHEDULER: NoticeScheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface HomeNotice {
  root: HTMLElement;
  /** Show `text` in `tone` at full opacity and (re)start the hold → fade → clear. */
  show(text: string, tone: StatusTone): void;
  /** Blank the slot now and cancel any pending timer. */
  clear(): void;
  /** Cancel any pending timer (the home is going away). */
  dispose(): void;
}

function makeSlot(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = BAR_TEXT_CSS;
  el.style.display = 'block';
  // Content-wide and centered on the column: the longest refusal is a little
  // wider than the 540px column at the 15px bar register, so the text may extend
  // past the column's edges and only ellipsizes at the window edge.
  el.style.width = 'max-content';
  el.style.maxWidth = 'calc(100vw - 52px)';
  el.style.height = 'var(--hc-home-notice)';
  el.style.lineHeight = 'var(--hc-home-notice)';
  el.style.textAlign = 'center';
  el.style.overflow = 'hidden';
  el.style.textOverflow = 'ellipsis';
  el.style.flex = 'none';
  el.setAttribute('role', 'status');
  return el;
}

export function makeHomeNotice(sched: NoticeScheduler = WINDOW_SCHEDULER): HomeNotice {
  const root = makeSlot();
  let timers: unknown[] = [];
  let dead = false;
  const cancel = (): void => {
    for (const id of timers) sched.clear(id);
    timers = [];
  };
  const blank = (): void => {
    cancel();
    root.textContent = '';
    root.style.transition = 'none';
    root.style.opacity = '1';
  };
  const fade = (): void => {
    root.style.transition = `opacity ${CLIENT_CONFIG.homeNoticeFadeMs}ms linear`;
    root.style.opacity = '0';
    timers = [sched.set(blank, CLIENT_CONFIG.homeNoticeFadeMs)];
  };
  return {
    root,
    show: (text, tone) => {
      if (dead) return;
      blank();
      root.textContent = text;
      root.style.color = toneColor(tone);
      timers = [sched.set(fade, CLIENT_CONFIG.homeNoticeHoldMs)];
    },
    clear: blank,
    dispose: () => {
      dead = true;
      cancel();
    },
  };
}
