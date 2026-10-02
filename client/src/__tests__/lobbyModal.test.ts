// THE LOBBY MODAL (cycle 167, Eric rulings 2026-10-02). The copy is ruling 9's
// and nothing else, so the whole rendered text is pinned for the host's view
// and for a non-host's — the queueModal.test.ts pattern. Also pinned: host
// controls exist ONLY for the host; the seed is an input for the host and the
// same text read-only for everyone else; READY ↔ UNREADY; START NOW's disabled
// reason (ruling 2); STARTS IN only while a deadline stands; YOU ARE HOST on a
// hand-off (ruling 6); ESC = LEAVE; the z rung and backdrop.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LobbyView } from '../net/lobby.js';
import {
  aboardLine,
  codeLine,
  hideLobbyModal,
  lobbyCountdownLine,
  lobbyModalVisible,
  showLobbyModal,
  startEligible,
  updateLobbyModal,
  type LobbyActions,
} from '../ui/lobbyModal.js';

const NOW = 1_000_000;

function view(over: Partial<LobbyView> = {}): LobbyView {
  return {
    code: 'QWERTY',
    hostId: 'me',
    mySessionId: 'me',
    seedText: '',
    botFill: false,
    countdownEndT: 0,
    deadlineAt: null,
    players: [{ id: 'me', name: 'NEMO', ready: false }],
    phase: 'open',
    ...over,
  };
}

function actions(): LobbyActions & Record<string, ReturnType<typeof vi.fn>> {
  return { onReady: vi.fn(), onSeed: vi.fn(), onBotFill: vi.fn(), onStart: vi.fn(), onLeave: vi.fn() };
}

function overlay(): HTMLElement {
  return document.getElementById('lobby-modal') as HTMLElement;
}

/** Every string a player can see, in DOM order: visible leaf text, plus each
 *  input as `[value|placeholder]`. Hidden slots contribute nothing. */
function rendered(): string[] {
  const out: string[] = [];
  overlay().querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el instanceof HTMLInputElement) {
      out.push(`[${el.value}|${el.placeholder}]`);
      return;
    }
    if (el.children.length > 0 || el.style.visibility === 'hidden') return;
    const t = (el.textContent ?? '').trim();
    if (t !== '') out.push(t);
  });
  return out;
}

function button(label: string): HTMLButtonElement {
  return [...overlay().querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
}

function seedInput(): HTMLInputElement | null {
  return overlay().querySelector('input');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  hideLobbyModal();
  vi.useRealTimers();
});

describe('pure copy and rules', () => {
  it('speaks ruling 9: CODE, N/20 ABOARD, STARTS IN m:ss', () => {
    expect(codeLine('KXQMAB')).toBe('CODE KXQMAB');
    expect(aboardLine(1)).toBe('1/20 ABOARD');
    expect(aboardLine(20)).toBe('20/20 ABOARD');
    expect(lobbyCountdownLine(NOW + 9_000, NOW)).toBe('STARTS IN 0:09');
    expect(lobbyCountdownLine(NOW + 10_000, NOW)).toBe('STARTS IN 0:10');
    expect(lobbyCountdownLine(NOW - 50, NOW)).toBe('STARTS IN 0:00');
    expect(lobbyCountdownLine(null, NOW)).toBe('');
  });

  it('a start is eligible with two captains, or with bot-fill on (ruling 2)', () => {
    expect(startEligible(view())).toBe(false);
    expect(startEligible(view({ botFill: true }))).toBe(true);
    const two = [
      { id: 'me', name: 'NEMO', ready: false },
      { id: 'b', name: 'AHAB', ready: false },
    ];
    expect(startEligible(view({ players: two }))).toBe(true);
  });
});

describe('the whole rendered text', () => {
  it("the HOST's view, alone and unready", () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(rendered()).toEqual([
      'LOBBY',
      'CODE QWERTY',
      '1/20 ABOARD',
      'NEMO',
      '[|SEED (OPTIONAL)]',
      'BOT-FILL',
      'START NOW',
      '2 CAPTAINS OR BOT-FILL REQUIRED',
      'READY',
      'LEAVE',
    ]);
  });

  it("a NON-HOST's view, mid-countdown, with a seed set and the host ready", () => {
    showLobbyModal(actions());
    updateLobbyModal(
      view({
        hostId: 'h',
        mySessionId: 'me',
        seedText: 'bananas',
        deadlineAt: NOW + 9_000,
        players: [
          { id: 'h', name: 'AHAB', ready: true },
          { id: 'me', name: 'NEMO', ready: true },
        ],
      }),
    );
    expect(rendered()).toEqual([
      'LOBBY',
      'CODE QWERTY',
      '2/20 ABOARD',
      'AHAB',
      'READY',
      'NEMO',
      'READY',
      'bananas',
      'STARTS IN 0:09',
      'UNREADY',
      'LEAVE',
    ]);
  });

  it('no title tooltips or other hidden words ride the modal', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(overlay().querySelectorAll('[title]').length).toBe(0);
  });
});

describe('host controls', () => {
  it('exist ONLY for the host — a non-host has no BOT-FILL, START NOW or seed input', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ hostId: 'h', players: [{ id: 'h', name: 'AHAB', ready: false }, { id: 'me', name: 'NEMO', ready: false }] }));
    expect(button('BOT-FILL')).toBeUndefined();
    expect(button('START NOW')).toBeUndefined();
    expect(seedInput()).toBeNull();
    expect(overlay().textContent).not.toContain('2 CAPTAINS OR BOT-FILL REQUIRED');
  });

  it('START NOW is disabled with the reason, then enabled by bot-fill or a second captain', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    expect(button('START NOW').disabled).toBe(true);
    button('START NOW').click();
    expect(a.onStart).not.toHaveBeenCalled();
    updateLobbyModal(view({ botFill: true }));
    expect(button('START NOW').disabled).toBe(false);
    expect(rendered()).not.toContain('2 CAPTAINS OR BOT-FILL REQUIRED');
    button('START NOW').click();
    expect(a.onStart).toHaveBeenCalledTimes(1);
    updateLobbyModal(view({ players: [{ id: 'me', name: 'NEMO', ready: false }, { id: 'b', name: 'AHAB', ready: false }] }));
    expect(button('START NOW').disabled).toBe(false);
  });

  it('BOT-FILL toggles against the lobby state and is lit when on', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    expect(button('BOT-FILL').getAttribute('aria-pressed')).toBe('false');
    button('BOT-FILL').click();
    expect(a.onBotFill).toHaveBeenLastCalledWith(true);
    updateLobbyModal(view({ botFill: true }));
    expect(button('BOT-FILL').getAttribute('aria-pressed')).toBe('true');
    expect(button('BOT-FILL').style.borderColor).toBe('var(--hc-phosphor)');
    button('BOT-FILL').click();
    expect(a.onBotFill).toHaveBeenLastCalledWith(false);
  });

  it('the seed is sent on Enter and on blur, trimmed, and only when changed', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    const input = seedInput() as HTMLInputElement;
    input.focus();
    input.value = '  bananas ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(a.onSeed).toHaveBeenLastCalledWith('bananas');
    updateLobbyModal(view({ seedText: 'bananas' }));
    input.blur();
    expect(a.onSeed).toHaveBeenCalledTimes(1); // unchanged — nothing re-sent
    input.focus();
    input.value = '';
    input.blur();
    expect(a.onSeed).toHaveBeenLastCalledWith(''); // cleared = no seed
  });

  it('a state push never clobbers what the host is typing', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    const input = seedInput() as HTMLInputElement;
    input.focus();
    input.value = 'half-typ';
    updateLobbyModal(view({ seedText: 'old' }));
    expect(input.value).toBe('half-typ');
  });
});

describe('READY / UNREADY', () => {
  it('reads READY until the player is ready, then UNREADY, and sends the flip', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    button('READY').click();
    expect(a.onReady).toHaveBeenLastCalledWith(true);
    updateLobbyModal(view({ players: [{ id: 'me', name: 'NEMO', ready: true }] }));
    expect(button('READY')).toBeUndefined();
    button('UNREADY').click();
    expect(a.onReady).toHaveBeenLastCalledWith(false);
  });
});

describe('STARTS IN', () => {
  it('appears only while a deadline stands, ticks, and goes when it is cleared', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    expect(rendered().some((t) => t.startsWith('STARTS IN'))).toBe(false);
    updateLobbyModal(view({ countdownEndT: 5, deadlineAt: NOW + 10_000 }));
    expect(rendered()).toContain('STARTS IN 0:10');
    vi.advanceTimersByTime(4_000);
    expect(rendered()).toContain('STARTS IN 0:06');
    updateLobbyModal(view({ countdownEndT: 0, deadlineAt: null }));
    expect(rendered().some((t) => t.startsWith('STARTS IN'))).toBe(false);
  });

  it('closing clears the tick', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval');
    showLobbyModal(actions());
    updateLobbyModal(view({ countdownEndT: 5, deadlineAt: NOW + 10_000 }));
    hideLobbyModal();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});

describe('YOU ARE HOST', () => {
  const two = [
    { id: 'h', name: 'AHAB', ready: false },
    { id: 'me', name: 'NEMO', ready: false },
  ];

  it('never shows for the creator, who was host from the start', () => {
    showLobbyModal(actions());
    updateLobbyModal(view());
    updateLobbyModal(view({ players: two.slice(1) }));
    expect(rendered()).not.toContain('YOU ARE HOST');
  });

  it('shows on a hand-off, with the host controls revealed', () => {
    showLobbyModal(actions());
    updateLobbyModal(view({ hostId: 'h', players: two }));
    expect(rendered()).not.toContain('YOU ARE HOST');
    updateLobbyModal(view({ hostId: 'me', players: two.slice(1) }));
    expect(rendered()).toEqual([
      'LOBBY',
      'YOU ARE HOST',
      'CODE QWERTY',
      '1/20 ABOARD',
      'NEMO',
      '[|SEED (OPTIONAL)]',
      'BOT-FILL',
      'START NOW',
      '2 CAPTAINS OR BOT-FILL REQUIRED',
      'READY',
      'LEAVE',
    ]);
  });
});

describe('lifecycle', () => {
  it("sits at the queue modal's z rung with a click-blocking backdrop, in the modal register", () => {
    showLobbyModal(actions());
    expect(overlay().style.zIndex).toBe('1150');
    expect(overlay().style.position).toBe('fixed');
    expect(overlay().style.inset).toBe('0px');
    const panel = overlay().firstElementChild as HTMLElement;
    expect(panel.style.borderRadius).toBe('12px');
    expect(panel.style.borderColor).toBe('var(--hc-hairline)');
    expect(button('LEAVE').style.borderRadius).toBe('8px');
  });

  it('LEAVE closes the modal, then leaves', () => {
    const a = actions();
    showLobbyModal(a);
    updateLobbyModal(view());
    button('LEAVE').click();
    expect(a.onLeave).toHaveBeenCalledTimes(1);
    expect(lobbyModalVisible()).toBe(false);
  });

  it('ESC is LEAVE, and the home never sees the key', () => {
    const a = actions();
    const homeEsc = vi.fn();
    window.addEventListener('keydown', homeEsc);
    showLobbyModal(a);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.removeEventListener('keydown', homeEsc);
    expect(a.onLeave).toHaveBeenCalledTimes(1);
    expect(lobbyModalVisible()).toBe(false);
    expect(homeEsc).not.toHaveBeenCalled();
  });

  it('a view after close resurrects nothing; a second open replaces the first', () => {
    showLobbyModal(actions());
    hideLobbyModal();
    updateLobbyModal(view());
    expect(overlay()).toBeNull();
    showLobbyModal(actions());
    showLobbyModal(actions());
    expect(document.querySelectorAll('#lobby-modal').length).toBe(1);
  });

  it('clicking the code line copies the code', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    showLobbyModal(actions());
    updateLobbyModal(view());
    const codeEl = [...overlay().querySelectorAll<HTMLElement>('div')].find((d) => d.textContent === 'CODE QWERTY');
    codeEl?.click();
    expect(writeText).toHaveBeenCalledWith('QWERTY');
    expect(rendered()).not.toContain('COPIED');
  });
});
