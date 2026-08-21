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
  PIP_LABEL_COL_PX,
  PIP_LABEL_TRACKING_EM,
  hueAngle,
  hueSortedIndices,
  makeHoistRow,
} from '../ui/classSelect.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { loadColorPref, __resetSessionColorPrefForTests, COLOR_PREF_KEY } from '../net/connection.js';
import { pipFill } from '../util/pips.js';
import { CLIENT_CONFIG } from '../config.js';
import { CONFIG } from '@salvo/shared';

// The connection module caches the session's rolled hue (review-gate fix for
// blocked-storage divergence); reset it per test so corrupt/absent-pref cases
// exercise a fresh roll instead of the previous test's cached one.
beforeEach(() => __resetSessionColorPrefForTests());
import { PLAYER_HUES, PLAYER_FILLS } from '../render/ships.js';
import { cssHex } from '../util/color.js';

// --- card view-model ---------------------------------------------------------

describe('cardViewModel — pips, keys, loadout', () => {
  // Objective anchor rework (Eric ruling 2026-08-03): pips derive from the
  // absolute {base, step} ladders in CLIENT_CONFIG.home.pip, not a relative
  // fraction of a class-roster maximum. Under the rebalanced hull hp
  // (125/175/150 — the TTK fix landed alongside this pip rework) the fills
  // are TB 4/2/4 · BS 2/4/2 · ML 3/3/3.
  it('pins Eric-ruled pip fills (TB 4/2/4 · BS 2/4/2 · ML 3/3/3)', () => {
    expect(cardViewModel('torpedoBoat').pips.map((p) => p.filled)).toEqual([4, 2, 4]);
    expect(cardViewModel('battleship').pips.map((p) => p.filled)).toEqual([2, 4, 2]);
    expect(cardViewModel('mineLayer').pips.map((p) => p.filled)).toEqual([3, 3, 3]);
  });

  it('labels the three pip rows SPEED / ARMOR / TURNING', () => {
    // ARMOR since 2026-08-21 (Eric: *"on ship select, change 'toughness' to
    // 'armor' so the text fits better"*). A COPY ruling only — the anchor key
    // it reads (`CLIENT_CONFIG.home.pip.toughness`), the ladder and the fills
    // are all untouched, and the row still reports hp. Same shape as the KILL
    // LEADER rename, which moved the player-facing words and left every
    // internal identifier alone.
    expect(cardViewModel('torpedoBoat').pips.map((p) => p.label)).toEqual(['SPEED', 'ARMOR', 'TURNING']);
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      expect(cardViewModel(cls).pips.map((p) => p.label), `${cls} agrees`)
        .toEqual(['SPEED', 'ARMOR', 'TURNING']);
    }
  });

  // THE REASON FOR THE RENAME, MEASURED — and the pin that stops it recurring.
  //
  // The label column is a FIXED 88px, the face is mono and the label carries its
  // own 0.16em track, so a label's width is exactly chars x (size x advance +
  // tracking) — countable, no canvas metrics needed. `TOUGHNESS` came to 96.4px
  // and overflowed an 88px cell; that is what Eric saw. Measured with
  // `monoTextWidth`, the same model `refitCardFit` uses for the refit card, so
  // the two container-fit laws share one metric rather than growing a second.
  it('every pip label FITS the label column — the defect that prompted the '
    + 'rename, now a standing bound on any future row', () => {
    const px = CLIENT_CONFIG.type.registers.hudMicro.size;
    const track = px * PIP_LABEL_TRACKING_EM;
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      for (const pip of cardViewModel(cls).pips) {
        const w = monoTextWidth(pip.label, px, track);
        expect(w, `${pip.label} is ${w.toFixed(1)}px in a ${PIP_LABEL_COL_PX}px column`)
          .toBeLessThanOrEqual(PIP_LABEL_COL_PX);
      }
    }
  });

  it('...and the retired label really did NOT fit, so the bound above is not '
    + 'vacuous', () => {
    const px = CLIENT_CONFIG.type.registers.hudMicro.size;
    const track = px * PIP_LABEL_TRACKING_EM;
    expect(monoTextWidth('TOUGHNESS', px, track)).toBeGreaterThan(PIP_LABEL_COL_PX);
    // ...while TURNING, now the longest of the three, has real room to spare.
    expect(monoTextWidth('TURNING', px, track)).toBeLessThan(PIP_LABEL_COL_PX);
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
      // Story 7-5: the cannon is DELETED and the broadside replaces it in the
      // Battleship's Q slot. This card was still advertising LONG-RANGE CANNON
      // to every player picking a hull — a live player-facing lie, caught only
      // because an agent read the class-select copy while renaming the buoy.
      { key: 'Q', value: 'BROADSIDE BARRAGE' },
      { key: 'E', value: 'STAR SHELLS' },
    ]);
    expect(cardViewModel('mineLayer').loadout).toEqual([
      { key: 'Q', value: 'PROXIMITY MINES' },
      { key: 'E', value: 'RADAR BUOY' },
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

// --- pipFill — objective anchor mapper edge cases ----------------------------

describe('pipFill — objective anchored-linear mapper (Eric ruling 2026-08-03)', () => {
  const { speed, toughness, turning } = CLIENT_CONFIG.home.pip;

  it('pins the config anchors', () => {
    expect(speed).toEqual({ base: 30, step: 5 });
    // DOUBLED with hull hp in balance cycle 1. The ladder is ABSOLUTE and
    // pipFill clamps at 5, so leaving it at 100/25 while hulls doubled would
    // have put all three at a clamped 5 pips and erased the readout.
    expect(toughness).toEqual({ base: 200, step: 50 });
    expect(turning).toEqual({ base: 0.2, step: 0.2 });
  });

  it('below-base value clamps to 1 pip (never blank)', () => {
    expect(pipFill(25, speed)).toBe(1); // < 30 base
  });

  it('above-top value clamps to 5 pips', () => {
    expect(pipFill(60, speed)).toBe(5); // > the 5-pip rung (50)
  });

  it('exact anchor landings', () => {
    expect(pipFill(45, speed)).toBe(4); // 30 + 3*5
    expect(pipFill(350, toughness)).toBe(4); // 200 + 3*50 — the Battleship, still 4 pips
    expect(pipFill(0.6, turning)).toBe(3); // 0.2 + 2*0.2
  });

  it('the three hulls still read 2 / 3 / 4 toughness pips after the hp doubling', () => {
    // THE PROPERTY THE LADDER CHANGE EXISTS TO PRESERVE. Hull hp and the ladder
    // doubled together in balance cycle 1, so the rendered readout is identical
    // to what shipped before it. Pinned against CONFIG rather than literals, so
    // a future hp retune that forgets the ladder fails HERE — visibly — instead
    // of silently flattening all three hulls to a clamped 5.
    expect(pipFill(CONFIG.shipClasses.torpedoBoat.hp, toughness)).toBe(2);
    expect(pipFill(CONFIG.shipClasses.mineLayer.hp, toughness)).toBe(3);
    expect(pipFill(CONFIG.shipClasses.battleship.hp, toughness)).toBe(4);
  });

  it('degenerate anchor (step <= 0 or non-finite base) clamps to 1', () => {
    expect(pipFill(40, { base: 30, step: 0 })).toBe(1);
    expect(pipFill(40, { base: 30, step: -5 })).toBe(1);
    // Review-gate fix: an unguarded NaN base survives the clamp as NaN and
    // paints a BLANK pip row — the one input class that broke never-blank.
    expect(pipFill(40, { base: Number.NaN, step: 5 })).toBe(1);
    expect(pipFill(40, { base: Number.POSITIVE_INFINITY, step: 5 })).toBe(1);
  });

  it('exact half-step rungs round UP despite float noise (review-gate fix)', () => {
    // (0.5-0.2)/0.2 = 1.4999999999999998 in floats; the formula in exact
    // arithmetic reads round(1.5) → 3 pips. The epsilon makes it so.
    expect(pipFill(0.5, turning)).toBe(3);
  });

  it('non-finite value clamps to 1', () => {
    expect(pipFill(Number.NaN, speed)).toBe(1);
    expect(pipFill(Number.POSITIVE_INFINITY, speed)).toBe(1);
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

  // Pins the click→Enter sequence: the existing Enter test above only reaches
  // the highlight via a digit key — this proves a mouse card-click sets the
  // same highlight Enter reads.
  it('Enter after a mouse card-click confirms the clicked class', () => {
    const { onConfirm } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click(); // highlight battleship via click
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

  // Pins the spec's I/O-matrix row: re-clicking the card that's already
  // highlighted must stay a pure no-op (no callback, no close).
  it('re-clicking the already-highlighted card is a no-op', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click(); // battleship — first click highlights it
    (cards[1] as HTMLElement).click(); // second click on the already-highlighted card
    expect(cards[1].querySelector('.hc-pickbtn')?.textContent).toBe('SELECTED ✓');
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // still mounted
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Pins the bubbling assumption: the in-card SELECT button is not a separate
  // click target — it's part of the whole-card click handler. A future
  // stopPropagation on the button would silently kill this path.
  it('clicking the in-card SELECT button itself highlights via bubbling', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    const pickBtn = cards[1].querySelector('.hc-pickbtn') as HTMLElement;
    pickBtn.click();
    expect(pickBtn.textContent).toBe('SELECTED ✓');
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
    // Pin the stored preference to an index other than 5 (hue 6) FIRST — with
    // localStorage empty, ColorHoist seeds from ensureColorPref(), which rolls
    // a RANDOM hue, and the `toBe(5)` assertion below could pass vacuously
    // whenever that random roll happened to land on 5.
    localStorage.setItem(COLOR_PREF_KEY, '0');
    const hoist = new ColorHoist();
    expect(hoist.selected).toBe(0); // seeded from the pinned pref, not a random roll
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

// THE COLOR HOIST READS AS A WHEEL (Eric ruling 2026-08-21: *"organize the
// colors by hue or something."*).
//
// The load-bearing half is what this DOES NOT touch. A wheel index is IDENTITY —
// the server assigns it at join and it rides `PlayerMeta.color` on the wire — so
// reordering `REGATTA_HUES` itself would repaint every player in the game and
// break the index->hex agreement both sides depend on. Only the order the row is
// WALKED in moves.
describe('the Color Hoist is displayed in hue order', () => {
  it('IS A PERMUTATION of the wheel — every index exactly once, none invented', () => {
    const order = hueSortedIndices(PLAYER_HUES);
    expect(order).toHaveLength(PLAYER_HUES.length);
    expect([...order].sort((a, b) => a - b)).toEqual(PLAYER_HUES.map((_, i) => i));
  });

  it('ascends by hue angle across the whole row', () => {
    const order = hueSortedIndices(PLAYER_HUES);
    const angles = order.map((i) => hueAngle(PLAYER_HUES[i]));
    for (let k = 1; k < angles.length; k++) {
      expect(angles[k], `swatch ${k} (${angles[k].toFixed(1)}deg) vs ${angles[k - 1].toFixed(1)}deg`)
        .toBeGreaterThanOrEqual(angles[k - 1]);
    }
  });

  it('is STABLE on ties, so equal hues keep wheel order (the colorblind assist '
    + 'collapses 20 indices onto 8 repeated families)', () => {
    // Three distinct hues, the middle one duplicated: the duplicates must come
    // out in ascending index order, not swapped.
    expect(hueSortedIndices([0xff0000, 0x00ff00, 0x00ff00, 0x0000ff])).toEqual([0, 1, 2, 3]);
    expect(hueSortedIndices([0x0000ff, 0x00ff00, 0x00ff00, 0xff0000])).toEqual([3, 1, 2, 0]);
  });

  it('really does REORDER something — the two sub-4-degree inversions the '
    + 'ratified wheel carries', () => {
    const order = hueSortedIndices(PLAYER_HUES);
    const wheel = PLAYER_HUES.map((_, i) => i);
    // cobalt(12) 233.0deg sits before periwinkle(13) 230.9deg in wheel order,
    // and orchid(15) 293.4deg before fuchsia(16) 289.9deg. Both are invisible to
    // the eye; the sort fixes them anyway because it is derived, not hand-listed.
    expect(order, 'the sort is not the identity').not.toEqual(wheel);
    expect(order.indexOf(13), 'periwinkle now precedes cobalt').toBeLessThan(order.indexOf(12));
    expect(order.indexOf(16), 'fuchsia now precedes orchid').toBeLessThan(order.indexOf(15));
  });

  it('hueAngle: primaries land where they should, and a grey is 0', () => {
    expect(hueAngle(0xff0000)).toBeCloseTo(0, 6);
    expect(hueAngle(0x00ff00)).toBeCloseTo(120, 6);
    expect(hueAngle(0x0000ff)).toBeCloseTo(240, 6);
    expect(hueAngle(0xffff00)).toBeCloseTo(60, 6);
    for (const grey of [0x000000, 0x808080, 0xffffff]) expect(hueAngle(grey)).toBe(0);
  });

  it('the row renders one swatch per hue, in that order, each picking its OWN '
    + 'wheel index', () => {
    const hoist = new ColorHoist();
    const { el, off } = makeHoistRow(hoist);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons).toHaveLength(PLAYER_HUES.length);
    const order = hueSortedIndices(PLAYER_HUES);
    // aria-label is `hue ${idx + 1}` — the TRUE wheel index, so it proves the
    // swatch kept its identity through the reorder.
    expect(buttons.map((b) => b.getAttribute('aria-label')))
      .toEqual(order.map((i) => `hue ${i + 1}`));
    // ...and clicking one selects that index, not its position in the row.
    const pos = 3;
    buttons[pos].click();
    expect(hoist.selected).toBe(order[pos]);
    off();
  });
});
