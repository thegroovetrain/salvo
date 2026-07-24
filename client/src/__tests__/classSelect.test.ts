// Story 1.14 — the class-select layer: pure helpers (card view-model, key map,
// highlight movement, chip loadout line, the shared ColorHoist) plus DOM-level
// pins on openClassSelect (pick / SET SAIL / ESC / dimmer semantics, focus
// suppression, blur of the home). DOM assertions follow the repo pattern.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cardViewModel,
  chipLoadoutLine,
  keyAction,
  moveHighlight,
  ColorHoist,
  openClassSelect,
  CLASS_DISPLAY_NAMES,
} from '../ui/classSelect.js';
import { loadColorPref } from '../net/connection.js';

// --- card view-model ---------------------------------------------------------

describe('cardViewModel — pips, keys, loadout', () => {
  it('pins Eric-ruled pip fills (TB 4/2/4 · BS 3/4/2 · ML 3/3/3)', () => {
    expect(cardViewModel('torpedoBoat').pips.map((p) => p.filled)).toEqual([4, 2, 4]);
    expect(cardViewModel('battleship').pips.map((p) => p.filled)).toEqual([3, 4, 2]);
    expect(cardViewModel('mineLayer').pips.map((p) => p.filled)).toEqual([3, 3, 3]);
  });

  it('labels the three pip rows SPEED / TOUGHNESS / TURNING', () => {
    expect(cardViewModel('torpedoBoat').pips.map((p) => p.label)).toEqual(['SPEED', 'TOUGHNESS', 'TURNING']);
  });

  it('displays zero-padded keys 01 / 02 / 03', () => {
    expect(cardViewModel('torpedoBoat').key).toBe('01');
    expect(cardViewModel('battleship').key).toBe('02');
    expect(cardViewModel('mineLayer').key).toBe('03');
  });

  it('carries NO fantasy tagline (Eric ruling 2026-07-24 — mock-era content, rejected)', () => {
    expect('fantasy' in cardViewModel('torpedoBoat')).toBe(false);
  });

  it('carries the two special-slot rows labeled by their future keys Q/E — no GUN row (Eric rulings 2026-07-24)', () => {
    expect(cardViewModel('torpedoBoat').loadout).toEqual([
      { key: 'Q', value: 'TORPEDO TUBES' },
      { key: 'E', value: 'SPEED BOOST' },
    ]);
    expect(cardViewModel('battleship').loadout).toEqual([
      { key: 'Q', value: 'LONG-RANGE CANNON' },
      { key: 'E', value: 'STAR SHELLS' },
    ]);
    expect(cardViewModel('mineLayer').loadout).toEqual([
      { key: 'Q', value: 'PROXIMITY MINES' },
      { key: 'E', value: 'DECOY BUOY' },
    ]);
  });

  it('names classes with their two-word display labels', () => {
    expect(CLASS_DISPLAY_NAMES).toEqual({
      torpedoBoat: 'TORPEDO BOAT',
      battleship: 'BATTLESHIP',
      mineLayer: 'MINE LAYER',
    });
  });
});

describe('chipLoadoutLine — compact home-chip sub-line', () => {
  it('joins STD GUN + the two specials', () => {
    expect(chipLoadoutLine('torpedoBoat')).toBe('STD GUN · TORPEDO TUBES · SPEED BOOST');
    expect(chipLoadoutLine('battleship')).toBe('STD GUN · LONG-RANGE CANNON · STAR SHELLS');
  });
});

// --- key map + highlight -----------------------------------------------------

describe('keyAction — layer key mapping', () => {
  it('maps digits 1..cardCount to a highlight', () => {
    expect(keyAction('1', 3)).toEqual({ kind: 'highlight', index: 0 });
    expect(keyAction('3', 3)).toEqual({ kind: 'highlight', index: 2 });
  });

  it('ignores digits beyond the card count', () => {
    expect(keyAction('4', 3)).toBeNull();
    expect(keyAction('0', 3)).toBeNull();
  });

  it('maps arrows to a move, Enter to pick, Escape to close', () => {
    expect(keyAction('ArrowLeft', 3)).toEqual({ kind: 'move', dir: -1 });
    expect(keyAction('ArrowUp', 3)).toEqual({ kind: 'move', dir: -1 });
    expect(keyAction('ArrowRight', 3)).toEqual({ kind: 'move', dir: 1 });
    expect(keyAction('ArrowDown', 3)).toEqual({ kind: 'move', dir: 1 });
    expect(keyAction('Enter', 3)).toEqual({ kind: 'pick' });
    expect(keyAction('Escape', 3)).toEqual({ kind: 'close' });
  });

  it('ignores any other key', () => {
    expect(keyAction('x', 3)).toBeNull();
  });
});

describe('moveHighlight — wrap-around', () => {
  it('wraps at both ends', () => {
    expect(moveHighlight(0, -1, 3)).toBe(2);
    expect(moveHighlight(2, 1, 3)).toBe(0);
    expect(moveHighlight(1, 1, 3)).toBe(2);
  });
});

// --- ColorHoist --------------------------------------------------------------

describe('ColorHoist — write/read round-trip + sync', () => {
  beforeEach(() => localStorage.clear());

  it('starts null with no stored preference and amber accent', () => {
    const h = new ColorHoist();
    expect(h.selected).toBeNull();
    expect(h.accentFill).toBe('none');
  });

  it('pick writes hullcracker.color (the exact key connect() reads) + notifies', () => {
    const h = new ColorHoist();
    const seen: number[] = [];
    h.onChange((i) => seen.push(i));
    h.pick(8); // cyan
    expect(localStorage.getItem('hullcracker.color')).toBe('8');
    expect(loadColorPref()).toBe(8); // connection.ts reads it back
    expect(h.selected).toBe(8);
    expect(seen).toEqual([8]);
  });

  it('two subscribers both fire on a pick (home + layer stay in sync)', () => {
    const h = new ColorHoist();
    const a = vi.fn();
    const b = vi.fn();
    h.onChange(a);
    h.onChange(b);
    h.pick(3);
    expect(a).toHaveBeenCalledWith(3);
    expect(b).toHaveBeenCalledWith(3);
  });

  it('unsubscribe stops further notifications', () => {
    const h = new ColorHoist();
    const fn = vi.fn();
    const off = h.onChange(fn);
    off();
    h.pick(5);
    expect(fn).not.toHaveBeenCalled();
  });
});

// --- openClassSelect DOM -----------------------------------------------------

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

describe('openClassSelect — DOM pick / dismiss semantics', () => {
  let blurTarget: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    blurTarget = document.createElement('div');
    document.body.appendChild(blurTarget);
  });
  afterEach(() => {
    document.getElementById('hc-class-select')?.remove();
    blurTarget.remove();
  });

  function open(cb: Partial<Parameters<typeof openClassSelect>[0]> = {}): {
    onPick: ReturnType<typeof vi.fn>;
    onSetSail: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  } {
    const onPick = vi.fn();
    const onSetSail = vi.fn();
    const onClose = vi.fn();
    openClassSelect({ initial: 'torpedoBoat', hoist: new ColorHoist(), blurTarget, onPick, onSetSail, onClose, ...cb });
    return { onPick, onSetSail, onClose };
  }

  it('renders three cards + the ghost card and the header', () => {
    open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const text = layer.textContent ?? '';
    expect(text).toContain('WHAT WILL YOU SAIL?');
    expect(text).toContain('TORPEDO BOAT');
    expect(text).toContain('BATTLESHIP');
    expect(text).toContain('MINE LAYER');
    expect(text).toContain('MORE CLASSES');
    expect(text).toContain('SET SAIL');
  });

  it('blurs the home overlay while open, restores it on close', () => {
    const { onClose } = open();
    expect(blurTarget.style.filter).toBe('blur(2px)');
    press('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(blurTarget.style.filter).toBe('');
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  it('Enter picks the highlighted class (no deploy) and closes', () => {
    const { onPick, onSetSail } = open();
    press('2'); // highlight battleship
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('battleship');
    expect(onSetSail).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  it('SET SAIL picks the highlight AND deploys in one press', () => {
    const { onSetSail, onPick } = open();
    press('3'); // highlight mineLayer
    const btn = [...document.querySelectorAll('#hc-class-select button')].find(
      (b) => b.textContent === 'SET SAIL',
    ) as HTMLButtonElement;
    btn.click();
    expect(onSetSail).toHaveBeenCalledWith('mineLayer');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a card click picks that class', () => {
    const { onPick } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    // first rail card = torpedoBoat
    const card = layer.querySelector('.hc-ccard') as HTMLElement;
    card.click();
    expect(onPick).toHaveBeenCalledWith('torpedoBoat');
  });

  it('suppresses shortcuts while a text input is focused (typing isolation)', () => {
    const { onPick } = open();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press('Enter');
    expect(onPick).not.toHaveBeenCalled();
    input.remove();
  });

  it('a dimmer click dismisses (onClose) without changing the pick', () => {
    const { onClose, onPick, onSetSail } = open();
    const dimmer = document.getElementById('hc-class-select')!.firstElementChild as HTMLElement;
    dimmer.click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
    expect(onSetSail).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  it('Enter is ignored when a layer button holds focus (native activation wins)', () => {
    const { onPick } = open();
    const setSail = [...document.querySelectorAll('#hc-class-select button')].find(
      (b) => b.textContent === 'SET SAIL',
    ) as HTMLButtonElement;
    setSail.focus();
    press('Enter');
    expect(onPick).not.toHaveBeenCalled(); // the window shortcut did NOT steal Enter
  });
});

describe('openClassSelect — teardown balances hoist subscriptions (no leak)', () => {
  let blurTarget: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    blurTarget = document.createElement('div');
    document.body.appendChild(blurTarget);
  });
  afterEach(() => {
    document.getElementById('hc-class-select')?.remove();
    blurTarget.remove();
  });

  it('a close() releases EVERY subscription the layer added (footer row included)', () => {
    const hoist = new ColorHoist();
    const before = hoist.listenerCount;
    const handle = openClassSelect({
      initial: 'torpedoBoat',
      hoist,
      blurTarget,
      onPick: vi.fn(),
      onSetSail: vi.fn(),
      onClose: vi.fn(),
    });
    expect(hoist.listenerCount).toBeGreaterThan(before); // layer added subscriptions
    handle.close();
    expect(hoist.listenerCount).toBe(before); // ...and released all of them
  });

  it('re-opening fully tears the prior layer down (one live layer, balanced subs)', () => {
    const hoist = new ColorHoist();
    const before = hoist.listenerCount;
    openClassSelect({ initial: 'torpedoBoat', hoist, blurTarget, onPick: vi.fn(), onSetSail: vi.fn(), onClose: vi.fn() });
    const afterFirst = hoist.listenerCount;
    openClassSelect({ initial: 'battleship', hoist, blurTarget, onPick: vi.fn(), onSetSail: vi.fn(), onClose: vi.fn() });
    expect(hoist.listenerCount).toBe(afterFirst); // prior layer's subs freed, not stacked
    expect(document.querySelectorAll('#hc-class-select').length).toBe(1);
  });
});
