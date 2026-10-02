// THE JOIN-CODE MODAL (cycle 167, Eric rulings 5 + 9). Pinned: the copy is
// exactly `ENTER CODE` / `JOIN` plus one of the three refusals; the field
// uppercases as typed and keeps A–Z only; JOIN enables at six letters; a
// refusal leaves the field as typed; ESC closes; and the modal takes the queue
// modal's z rung with its click-blocking backdrop.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  hideJoinCodeModal,
  joinCodeModalVisible,
  setJoinCodePending,
  showJoinCodeFailure,
  showJoinCodeModal,
} from '../ui/joinCodeModal.js';

function overlay(): HTMLElement {
  return document.getElementById('join-code-modal') as HTMLElement;
}

function input(): HTMLInputElement {
  return overlay().querySelector('input') as HTMLInputElement;
}

function joinBtn(): HTMLButtonElement {
  return overlay().querySelector('button') as HTMLButtonElement;
}

function type(text: string): void {
  input().value = text;
  input().dispatchEvent(new Event('input'));
}

/** Every string a player can see: visible element text + the field's value. */
function visibleText(): string[] {
  const out: string[] = [];
  overlay().querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.children.length > 0 || el.style.visibility === 'hidden') return;
    const t = (el.textContent ?? '').trim();
    if (t !== '') out.push(t);
  });
  return out;
}

function open(): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const h = { onSubmit: vi.fn(), onClose: vi.fn() };
  showJoinCodeModal(h);
  return h;
}

afterEach(() => hideJoinCodeModal());

describe('the join-code modal', () => {
  it('renders exactly ENTER CODE and JOIN (no other word)', () => {
    open();
    expect(visibleText()).toEqual(['ENTER CODE', 'JOIN']);
    expect(input().placeholder).toBe('');
    expect(overlay().querySelectorAll('[title]').length).toBe(0);
  });

  it("sits at the queue modal's z rung with a click-blocking backdrop", () => {
    open();
    expect(overlay().style.zIndex).toBe('1150');
    expect(overlay().style.position).toBe('fixed');
    expect(overlay().style.inset).toBe('0px');
    const panel = overlay().firstElementChild as HTMLElement;
    expect(panel.style.borderRadius).toBe('12px');
    expect(panel.style.borderColor).toBe('var(--hc-hairline)');
    expect(input().style.borderRadius).toBe('8px');
    expect(joinBtn().style.borderRadius).toBe('8px');
  });

  it('uppercases as typed and keeps A–Z only, six at most', () => {
    open();
    type('k7x-q2m');
    expect(input().value).toBe('KXQM');
    // Past six letters the LAST six are kept (review C8) — a pasted
    // "CODE ABCDEF" lands as the code, not CODEAB.
    type('abcdefgh');
    expect(input().value).toBe('CDEFGH');
    type('CODE ABCDEF');
    expect(input().value).toBe('ABCDEF');
    type('a b\tc😀d');
    expect(input().value).toBe('ABCD');
  });

  it('JOIN is disabled until the field holds six letters', () => {
    const h = open();
    expect(joinBtn().disabled).toBe(true);
    type('abcde');
    expect(joinBtn().disabled).toBe(true);
    joinBtn().click();
    expect(h.onSubmit).not.toHaveBeenCalled();
    type('abcdef');
    expect(joinBtn().disabled).toBe(false);
    joinBtn().click();
    expect(h.onSubmit).toHaveBeenCalledWith('ABCDEF');
  });

  it('Enter in the field submits a full code', () => {
    const h = open();
    type('qwerty');
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(h.onSubmit).toHaveBeenCalledWith('QWERTY');
  });

  it('JOIN is held while a join is in flight', () => {
    const h = open();
    type('qwerty');
    setJoinCodePending(true);
    expect(joinBtn().disabled).toBe(true);
    joinBtn().click();
    expect(h.onSubmit).not.toHaveBeenCalled();
    setJoinCodePending(false);
    expect(joinBtn().disabled).toBe(false);
  });

  it.each(['NO SUCH LOBBY', 'LOBBY FULL', 'MATCH STARTED'] as const)(
    'shows the refusal %s and keeps the field as typed',
    (reason) => {
      open();
      type('qwerty');
      showJoinCodeFailure(reason);
      expect(visibleText()).toEqual(['ENTER CODE', 'JOIN', reason]);
      expect(input().value).toBe('QWERTY');
      expect(joinCodeModalVisible()).toBe(true);
    },
  );

  it('editing the field clears a shown refusal', () => {
    open();
    type('qwerty');
    showJoinCodeFailure('NO SUCH LOBBY');
    type('qwert');
    expect(visibleText()).toEqual(['ENTER CODE', 'JOIN']);
  });

  it('ESC closes it, and the home never sees the key', () => {
    const h = open();
    const homeEsc = vi.fn();
    window.addEventListener('keydown', homeEsc);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.removeEventListener('keydown', homeEsc);
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(joinCodeModalVisible()).toBe(false);
    expect(overlay()).toBeNull();
    expect(homeEsc).not.toHaveBeenCalled();
  });

  it('never stacks: a second open replaces the first', () => {
    open();
    open();
    expect(document.querySelectorAll('#join-code-modal').length).toBe(1);
  });

  it('closing detaches its ESC binding', () => {
    const h = open();
    hideJoinCodeModal();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(h.onClose).not.toHaveBeenCalled();
  });
});
