// Story 1.14 — the class-select layer: pure helpers (card view-model, key map,
// highlight movement, the shared ColorHoist) plus DOM-level pins on
// openClassSelect (pick / CONFIRM SELECTION / ESC / dimmer semantics, focus
// suppression, blur of the home). DOM assertions follow the repo pattern.
//
// Home-page maintenance patch re-takes three pins DELIBERATELY: the footer
// button is CONFIRM SELECTION (it saves + closes, it does NOT deploy), the
// ColorHoist index is NEVER null (it seeds from ensureColorPref, which rolls +
// persists a random Regatta hue when none is stored), and the claim-caveat
// caption is replaced by a `COLOR PREFERENCE:` label left of the swatches.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cardViewModel,
  keyAction,
  moveHighlight,
  ColorHoist,
  openClassSelect,
  CLASS_DISPLAY_NAMES,
} from '../ui/classSelect.js';
import { loadColorPref, __resetSessionColorPrefForTests } from '../net/connection.js';

// The connection module caches the session's rolled hue (review-gate fix for
// blocked-storage divergence); reset it per test so corrupt/absent-pref cases
// exercise a fresh roll instead of the previous test's cached one.
beforeEach(() => __resetSessionColorPrefForTests());
import { PLAYER_HUES, PLAYER_FILLS } from '../render/ships.js';
import { cssHex } from '../util/color.js';

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

  // RE-TAKEN pin (was: "starts null … and amber accent"). Unset no longer means
  // amber — ensureColorPref rolls a real hue and persists it before first paint.
  it('with NO stored preference: seeds a real random hue, persists it, never null', () => {
    const h = new ColorHoist();
    expect(h.selected).not.toBeNull();
    expect(Number.isInteger(h.selected)).toBe(true);
    expect(h.selected).toBeGreaterThanOrEqual(0);
    expect(h.selected).toBeLessThan(PLAYER_HUES.length);
    expect(localStorage.getItem('hullcracker.color')).toBe(String(h.selected)); // persisted at construction
    expect(loadColorPref()).toBe(h.selected);
    expect(h.accentFill).not.toBe('none'); // the fill-'none' unset branch is gone
    expect(h.accent).toBe(cssHex(PLAYER_HUES[h.selected]));
    expect(h.accentFill).toBe(cssHex(PLAYER_FILLS[h.selected]));
  });

  it('a VALID stored preference is used verbatim, never rerolled', () => {
    localStorage.setItem('hullcracker.color', '8'); // cyan
    const h = new ColorHoist();
    expect(h.selected).toBe(8);
    expect(h.accent).toBe(cssHex(PLAYER_HUES[8]));
    expect(h.accentValue).toBe(PLAYER_HUES[8]);
    expect(localStorage.getItem('hullcracker.color')).toBe('8');
  });

  it('a CORRUPT stored preference is treated as absent (reroll + persist)', () => {
    localStorage.setItem('hullcracker.color', 'not-a-hue');
    const h = new ColorHoist();
    expect(Number.isInteger(h.selected)).toBe(true);
    expect(h.selected).toBeLessThan(PLAYER_HUES.length);
    expect(loadColorPref()).toBe(h.selected); // the garbage was replaced by a valid index
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
    onConfirm: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  } {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    openClassSelect({ initial: 'torpedoBoat', hoist: new ColorHoist(), blurTarget, onConfirm, onClose, ...cb });
    return { onConfirm, onClose };
  }

  /** The footer primary, found by its RE-TAKEN label (was SET SAIL). */
  function confirmButton(): HTMLButtonElement {
    return [...document.querySelectorAll('#hc-class-select button')].find(
      (b) => b.textContent === 'CONFIRM SELECTION',
    ) as HTMLButtonElement;
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
    expect(text).toContain('CONFIRM SELECTION'); // RE-TAKEN pin: was SET SAIL
    expect(text).not.toContain('SET SAIL');
  });

  it('the footer labels the swatches COLOR PREFERENCE: — the claim caveat caption is gone', () => {
    open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const text = layer.textContent ?? '';
    expect(text).toContain('COLOR PREFERENCE:');
    expect(text).not.toContain('PREFERENCE PICK'); // the retired caption
    expect(text).not.toContain('NEAREST FREE HUE');
    // the label sits to the LEFT of the swatch row (same flex row, first child)
    const swatch = layer.querySelector('button[aria-label="hue 1"]') as HTMLElement;
    const row = swatch.parentElement as HTMLElement;
    const wrap = row.parentElement as HTMLElement;
    expect(wrap.firstElementChild?.textContent).toBe('COLOR PREFERENCE:');
    expect(wrap.style.flexDirection).toBe('row');
  });

  it('the class bay still carries all 20 swatches (the ONE picker in the app)', () => {
    open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    expect(layer.querySelectorAll('button[aria-label^="hue "]').length).toBe(PLAYER_HUES.length);
  });

  // Finding B regression pin: the footer (label + 20 swatches + the min-width
  // CONFIRM button) is a nowrap flex row in a panel with vertical-only
  // scrolling — below ~700px viewport width the button clipped outside the
  // panel and became partially unclickable. flex-wrap lets it degrade by
  // wrapping instead (the ratified 1366x768 floor still fits on one row).
  it('the footer row wraps instead of clipping at narrow viewport widths (Finding B)', () => {
    open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const swatch = layer.querySelector('button[aria-label="hue 1"]') as HTMLElement;
    const hoistWrap = swatch.parentElement!.parentElement as HTMLElement; // makeHoistRow's outer wrap
    const footer = hoistWrap.parentElement as HTMLElement;
    expect(footer.style.flexWrap).toBe('wrap');
  });

  it('blurs the home overlay while open, restores it on close', () => {
    const { onClose } = open();
    expect(blurTarget.style.filter).toBe('blur(2px)');
    press('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(blurTarget.style.filter).toBe('');
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // RE-TAKEN pin: Enter ≡ CONFIRM SELECTION (it used to route to onPick, now retired).
  it('Enter CONFIRMS the highlighted class (no deploy) and closes', () => {
    const { onConfirm } = open();
    press('2'); // highlight battleship
    press('Enter');
    expect(onConfirm).toHaveBeenCalledWith('battleship');
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // RE-TAKEN pin (was "SET SAIL picks the highlight AND deploys in one press"):
  // the button confirms the highlight and closes — deploying is PLAY's job now.
  it('CONFIRM SELECTION hands back the highlight and closes — it never deploys', () => {
    const { onConfirm, onClose } = open();
    press('3'); // highlight mineLayer
    confirmButton().click();
    expect(onConfirm).toHaveBeenCalledWith('mineLayer');
    expect(onClose).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull(); // closed back to port
  });

  // NOTE: the amber outline+glow chrome (Eric ruling: byte-identical to the
  // SET SAIL treatment it replaces) is NOT assertable here — jsdom's cssstyle
  // cannot parse `border:1px solid var(--hc-amber)` and silently voids the
  // WHOLE style blob (the documented CSSOM-blob hazard; the PLAY button has the
  // same blind spot). What IS pinned: the button carries no personal-hue tint,
  // i.e. the layer's accent repaint never touches it.
  it('CONFIRM SELECTION is never personal-tinted (amber stays the action register)', () => {
    const hoist = new ColorHoist();
    hoist.pick(8);
    open({ hoist });
    const btn = confirmButton();
    expect(btn.style.borderColor).not.toBe(cssHex(PLAYER_HUES[8]));
    expect(btn.style.color).not.toBe(cssHex(PLAYER_HUES[8]));
  });

  // RE-TAKEN pin (Eric ruling 2026-08-03): a card click no longer picks-and-closes
  // — it only highlights. onPick is retired entirely (no such callback exists
  // anymore), so the surviving spies are onConfirm/onClose.
  it('a card click highlights that card and keeps the layer open', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    const pickBtnText = (i: number): string | null | undefined =>
      cards[i].querySelector('.hc-pickbtn')?.textContent;
    expect(pickBtnText(0)).toBe('SELECTED ✓'); // initial highlight: torpedoBoat (index 0)

    (cards[1] as HTMLElement).click(); // battleship card
    expect(pickBtnText(1)).toBe('SELECTED ✓');
    expect(pickBtnText(0)).toBe('SELECT');
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // still mounted
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('click card B then CONFIRM hands back class B and closes', () => {
    const { onConfirm } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click(); // battleship
    confirmButton().click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith('battleship');
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  it('click card B then ESC discards it — onClose fires, onConfirm never does', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click(); // battleship
    press('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // One-visit flow (the ruling's whole point): a click on a card, a click on a
  // color swatch, and CONFIRM — all in a single bay open — must hand back the
  // clicked class while the swatch pick has already persisted independently.
  it('one visit: card click + swatch click + CONFIRM changes both ship and color', () => {
    const hoist = new ColorHoist();
    const { onConfirm } = open({ hoist });
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[2] as HTMLElement).click(); // mineLayer

    const swatch = layer.querySelector('button[aria-label="hue 6"]') as HTMLButtonElement;
    swatch.click();
    expect(hoist.selected).toBe(5); // swatch pick persisted immediately

    confirmButton().click();
    expect(onConfirm).toHaveBeenCalledWith('mineLayer');
    expect(hoist.selected).toBe(5); // untouched by confirm — already persisted at swatch click
  });

  it('suppresses shortcuts while a text input is focused (typing isolation)', () => {
    const { onConfirm } = open();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press('Enter');
    expect(onConfirm).not.toHaveBeenCalled();
    input.remove();
  });

  it('a dimmer click dismisses (onClose) without changing the pick', () => {
    const { onClose, onConfirm } = open();
    const dimmer = document.getElementById('hc-class-select')!.firstElementChild as HTMLElement;
    dimmer.click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  it('ESC closes with NO class change (semantics unchanged by the confirm patch)', () => {
    const { onClose, onConfirm } = open();
    press('2'); // move the highlight — ESC must still not commit it
    press('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // RENAMED (Codex finding): the old name claimed to prove "native activation
  // wins", but this dispatches keydown on `window` — jsdom has no native
  // button-activation behavior to observe. What this actually proves: the
  // window-level shortcut handler stays quiet for Enter/Space while a layer
  // button holds focus. EXTENDED (Finding A ruling): the guard is narrowed to
  // ONLY those two keys — ESC and arrows must still reach the layer even while
  // a button (e.g. a focused swatch) holds focus.
  it('Enter/Space stay swallowed by the window handler while a layer button holds focus; ESC and arrows still work regardless of focus', () => {
    const { onConfirm, onClose } = open();
    confirmButton().focus();
    press('Enter');
    expect(onConfirm).not.toHaveBeenCalled(); // the window shortcut did NOT steal Enter
    press(' '); // Space is swallowed the same way (native button activation)
    expect(onConfirm).not.toHaveBeenCalled();

    // Finding A: a color swatch is a layer BUTTON too (the bay is the app's
    // ONLY color picker) — while it holds focus, ArrowRight must still move
    // the highlight and ESC must still close.
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    const pickBtnText = (i: number): string | null | undefined =>
      cards[i].querySelector('.hc-pickbtn')?.textContent;
    expect(pickBtnText(0)).toBe('SELECTED ✓'); // initial highlight: torpedoBoat

    const swatch = layer.querySelector('button[aria-label="hue 1"]') as HTMLButtonElement;
    swatch.focus();
    press('ArrowRight'); // must move despite the swatch (a BUTTON) holding focus
    expect(pickBtnText(1)).toBe('SELECTED ✓'); // battleship now highlighted
    expect(pickBtnText(0)).toBe('SELECT');

    press('Escape'); // must still close despite focus
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // Finding A regression pin: clicking a swatch used to leave it focused, and
  // the (unnarrowed) guard then swallowed EVERY key — ESC included — until a
  // stray mouse click restored the keyboard. The fix blurs the swatch after
  // pick, so ESC keeps working right after a real click.
  it('a swatch click still lets ESC close the layer afterward (Finding A)', () => {
    const { onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const swatch = layer.querySelector('button[aria-label="hue 3"]') as HTMLButtonElement;
    swatch.focus(); // simulate the browser's implicit focus-on-click
    swatch.click();
    press('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // Finding A regression pin: without the post-pick blur, Enter stays
  // swallowed by the narrowed guard too (it deliberately still swallows
  // Enter/Space while ANY layer button — including a swatch — holds focus).
  // Only the blur restores Enter → CONFIRM SELECTION via the window handler.
  it('a swatch click still lets Enter confirm via the window handler afterward (Finding A)', () => {
    const { onConfirm } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const swatch = layer.querySelector('button[aria-label="hue 3"]') as HTMLButtonElement;
    swatch.focus();
    swatch.click();
    expect(document.activeElement).not.toBe(swatch); // blurred after the pick
    press('Enter');
    expect(onConfirm).toHaveBeenCalledWith('torpedoBoat'); // highlight unchanged; only the color changed
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
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    });
    expect(hoist.listenerCount).toBeGreaterThan(before); // layer added subscriptions
    handle.close();
    expect(hoist.listenerCount).toBe(before); // ...and released all of them
  });

  it('re-opening fully tears the prior layer down (one live layer, balanced subs)', () => {
    const hoist = new ColorHoist();
    const before = hoist.listenerCount;
    openClassSelect({ initial: 'torpedoBoat', hoist, blurTarget, onConfirm: vi.fn(), onClose: vi.fn() });
    const afterFirst = hoist.listenerCount;
    openClassSelect({ initial: 'battleship', hoist, blurTarget, onConfirm: vi.fn(), onClose: vi.fn() });
    expect(hoist.listenerCount).toBe(afterFirst); // prior layer's subs freed, not stacked
    expect(document.querySelectorAll('#hc-class-select').length).toBe(1);
  });
});
