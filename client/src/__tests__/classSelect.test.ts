// Story 1.14 — the class-select layer: pure helpers (card view-model, key map,
// highlight movement) plus DOM-level pins on openClassSelect (pick / CONFIRM
// SELECTION / ESC / dimmer semantics, focus suppression, blur of the home).
// DOM assertions follow the repo pattern.
//
// The footer button is CONFIRM SELECTION (it saves + closes, it does NOT
// deploy). Story 10.4: FOUR cards (one per SHIP_CLASS_IDS), no ghost card, no
// Color Hoist (R6), and the DECK GUN chips became ONE three-way Shift pick
// (`SPECIAL` row, chips from SHIFT_IDS, shared by every card).
//
// STORY 9.14 (ruling R3): no label, class name or card copy is pinned. The
// highlight is read off the card's lit register (its glow), the chips off
// `data-shift`, and names off the exported tables they come from.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cardViewModel,
  keyAction,
  moveHighlight,
  openClassSelect,
  CLASS_DISPLAY_NAMES,
  PIP_LABEL_COL_PX,
  PIP_LABEL_TRACKING_EM,
  SPECIAL_KEY,
  CARD_INNER_PX,
  LOADOUT_KEY_COL_PX,
  LOADOUT_KEY_TRACKING_EM,
  shiftChipWidth,
} from '../ui/classSelect.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { pipFill } from '../util/pips.js';
import { indexWord } from '../ui/boonCopy.js';
import { CLIENT_CONFIG } from '../config.js';
import {
  CONFIG,
  DEFAULT_SHIFT,
  INDEX_IDS,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  type ShiftId,
} from '@salvo/shared';

const FIRST = SHIP_CLASS_IDS[0];
const SECOND = SHIP_CLASS_IDS[1];
const THIRD = SHIP_CLASS_IDS[2];
/** A Shift that is not the default — so a pick is observable. */
const OTHER_SHIFT = SHIFT_IDS.find((id) => id !== DEFAULT_SHIFT) as ShiftId;

/** The footer primary: the one layer button that is not a Shift chip (found
 *  by role, never by label). */
function confirmButtonIn(root: ParentNode): HTMLButtonElement {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => !b.hasAttribute('aria-label') && !b.classList.contains('hc-shiftchip') && b.textContent !== '',
  ) as HTMLButtonElement;
}

// --- card view-model ---------------------------------------------------------

describe('cardViewModel — pips, keys, loadout', () => {
  // Objective anchor rework (Eric ruling 2026-08-03): pips derive from the
  // absolute {base, step} ladders in CLIENT_CONFIG.home.pip, not a relative
  // fraction of a class-roster maximum. Since Story 10.3 the rows are INDICES
  // read off the hull envelope's own `index` on index anchors; Story 10.4 wave
  // 2c shows ARMOR / POWER / ENGINES, in the SHIP panel's (INDEX_IDS) order and
  // with that panel's own words.
  it('each pip row is its index on its own anchor, in the SHIP panel order and words', () => {
    const anchors = CLIENT_CONFIG.home.pip;
    for (const cls of SHIP_CLASS_IDS) {
      const vm = cardViewModel(cls);
      const idx = vm.pips.map((p) => p.index);
      expect(idx, cls).toEqual(INDEX_IDS.filter((id) => (idx as readonly string[]).includes(id)));
      expect(idx, cls).not.toContain('rudder'); // the same on all four hulls: it tells the player nothing
      for (const pip of vm.pips) expect(pip.label).toBe(indexWord(pip.index));
      for (const pip of vm.pips) {
        expect(pip.filled, `${cls} ${pip.index}`).toBe(pipFill(CONFIG.shipClasses[cls].index[pip.index], anchors[pip.index]));
      }
    }
  });

  it('a hull with the higher index never shows fewer pips on that row', () => {
    for (const a of SHIP_CLASS_IDS) {
      for (const b of SHIP_CLASS_IDS) {
        for (const [row, pip] of cardViewModel(a).pips.entries()) {
          if (CONFIG.shipClasses[a].index[pip.index] > CONFIG.shipClasses[b].index[pip.index]) {
            expect(pip.filled, `${a} vs ${b} ${pip.index}`).toBeGreaterThanOrEqual(cardViewModel(b).pips[row].filled);
          }
        }
      }
    }
  });

  it('every card labels the same three pip rows, in the same order', () => {
    const rows = cardViewModel(FIRST).pips.map((p) => p.label);
    expect(rows).toHaveLength(3);
    expect(new Set(rows).size).toBe(3);
    for (const cls of SHIP_CLASS_IDS) {
      expect(cardViewModel(cls).pips.map((p) => p.label), `${cls} agrees`).toEqual(rows);
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
    for (const cls of SHIP_CLASS_IDS) {
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
  });

  it('displays zero-padded keys in menu order, one per hull', () => {
    SHIP_CLASS_IDS.forEach((cls, i) => {
      expect(cardViewModel(cls).key, cls).toBe(String(i + 1).padStart(2, '0'));
    });
  });

  it('carries NO fantasy tagline (Eric ruling 2026-07-24 — mock-era content, rejected)', () => {
    expect('fantasy' in cardViewModel(FIRST)).toBe(false);
  });

  it('carries NO read-only loadout rows — the Shift is the seat\'s pick, not the hull\'s (Story 10.4)', () => {
    for (const cls of SHIP_CLASS_IDS) expect(cardViewModel(cls).loadout, cls).toEqual([]);
  });

  it('gives every class one distinct, non-empty display name (amendment 204)', () => {
    expect(Object.keys(CLASS_DISPLAY_NAMES).sort()).toEqual([...SHIP_CLASS_IDS].sort());
    for (const id of SHIP_CLASS_IDS) expect(CLASS_DISPLAY_NAMES[id].length, id).toBeGreaterThan(0);
    expect(new Set(Object.values(CLASS_DISPLAY_NAMES)).size).toBe(SHIP_CLASS_IDS.length);
  });
});

// --- pipFill — objective anchor mapper edge cases ----------------------------

describe('pipFill — objective anchored-linear mapper (Eric ruling 2026-08-03)', () => {
  const { engines } = CLIENT_CONFIG.home.pip;
  const half = { base: 0.2, step: 0.2 }; // a non-dyadic ladder for the float-noise case

  it('every index row is anchored at the index base (Story 10.3): the average ship reads 1 pip', () => {
    for (const anchor of Object.values(CLIENT_CONFIG.home.pip)) {
      expect(anchor.base).toBe(CONFIG.index.base);
      expect(anchor.step).toBeGreaterThan(0);
    }
  });

  it('below-base value clamps to 1 pip (never blank)', () => {
    expect(pipFill(engines.base - engines.step, engines)).toBe(1);
  });

  it('above-top value clamps to 5 pips', () => {
    expect(pipFill(engines.base + 6 * engines.step, engines)).toBe(5);
  });

  it('exact anchor landings', () => {
    for (let k = 0; k <= 4; k += 1) expect(pipFill(engines.base + k * engines.step, engines)).toBe(k + 1);
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
    expect(pipFill(0.5, half)).toBe(3);
  });

  it('non-finite value clamps to 1', () => {
    expect(pipFill(Number.NaN, engines)).toBe(1);
    expect(pipFill(Number.POSITIVE_INFINITY, engines)).toBe(1);
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

// --- openClassSelect DOM -----------------------------------------------------

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

/** Is card i the highlighted one? The lit register wears a glow; the unlit
 *  one is `box-shadow: none` (paintCardOn / paintCardOff). */
function lit(i: number): boolean {
  const card = document.querySelectorAll<HTMLElement>('#hc-class-select .hc-ccard')[i];
  return card.style.boxShadow !== 'none' && card.style.boxShadow !== '';
}

/** Which cards are lit, in rail order. */
function litMap(): boolean[] {
  return SHIP_CLASS_IDS.map((_, i) => lit(i));
}

/** The expected lit map with exactly card `i` lit. */
function only(i: number): boolean[] {
  return SHIP_CLASS_IDS.map((_, k) => k === i);
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
    openClassSelect({ initial: FIRST, blurTarget, onConfirm, onClose, ...cb });
    return { onConfirm, onClose };
  }

  const confirmButton = (): HTMLButtonElement =>
    confirmButtonIn(document.getElementById('hc-class-select') as HTMLElement);

  it('renders one card per hull on one rail — no ghost card — each card naming its class', () => {
    open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll<HTMLElement>('.hc-ccard')];
    expect(cards).toHaveLength(SHIP_CLASS_IDS.length);
    const rail = cards[0].parentElement as HTMLElement;
    expect([...rail.children]).toEqual(cards); // the cards and nothing else
    SHIP_CLASS_IDS.forEach((cls, i) => {
      expect(cards[i].querySelector('.hc-cname')?.textContent, cls).toBe(CLASS_DISPLAY_NAMES[cls]);
    });
    expect(layer.querySelector('h3')).not.toBeNull(); // the header
  });

  it('carries no Color Hoist: no hue swatch anywhere in the layer (R6)', () => {
    open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    expect(layer.querySelectorAll('button[aria-label^="hue "]')).toHaveLength(0);
  });

  // Finding B regression pin: the footer is a flex row in a panel with
  // vertical-only scrolling — below ~700px viewport width the button clipped
  // outside the panel. flex-wrap lets it degrade by wrapping instead.
  it('the footer row wraps instead of clipping at narrow viewport widths (Finding B)', () => {
    open();
    const footer = confirmButton().parentElement as HTMLElement;
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
    press('2');
    press('Enter');
    expect(onConfirm).toHaveBeenCalledWith(SECOND, DEFAULT_SHIFT);
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // Pins the click→Enter sequence: a mouse card-click sets the same highlight
  // Enter reads.
  it('Enter after a mouse card-click confirms the clicked class', () => {
    const { onConfirm } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click();
    press('Enter');
    expect(onConfirm).toHaveBeenCalledWith(SECOND, DEFAULT_SHIFT);
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // AMENDMENT 62 (Story 8.10): no weapon row on any card. Story 10.4: the
  // loadout block holds only the SPECIAL row's Shift chips.
  it('builds ONE loadout block (the Shift chips) and no weapon row on any card', () => {
    open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')] as HTMLElement[];
    expect(cards).toHaveLength(SHIP_CLASS_IDS.length);
    for (const card of cards) {
      // head, silhouette box, pip grid, the loadout block, pick-button row.
      expect(card.children).toHaveLength(5);
      const loadout = card.children[3] as HTMLElement;
      expect(loadout.querySelectorAll('.hc-shiftchip')).toHaveLength(SHIFT_IDS.length);
      expect(loadout.children).toHaveLength(1); // the SPECIAL row only
    }
  });

  // RE-TAKEN pin: the button confirms the highlight and closes — deploying is PLAY's job.
  it('CONFIRM SELECTION hands back the highlight and closes — it never deploys', () => {
    const { onConfirm, onClose } = open();
    press('3');
    confirmButton().click();
    expect(onConfirm).toHaveBeenCalledWith(THIRD, DEFAULT_SHIFT);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull(); // closed back to port
  });

  // RE-TAKEN pin (Eric ruling 2026-08-03): a card click only highlights.
  it('a card click highlights that card and keeps the layer open', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    expect(litMap()).toEqual(only(0)); // initial highlight
    const pickBtnText = (i: number): string | null | undefined => cards[i].querySelector('.hc-pickbtn')?.textContent;
    const [onLabel, offLabel] = [pickBtnText(0), pickBtnText(1)];
    expect(onLabel).not.toBe(offLabel); // the pick button reads the state too

    (cards[1] as HTMLElement).click();
    expect(litMap()).toEqual(only(1));
    expect(pickBtnText(1)).toBe(onLabel);
    expect(pickBtnText(0)).toBe(offLabel);
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // still mounted
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens on the initial class', () => {
    open({ initial: SHIP_CLASS_IDS[SHIP_CLASS_IDS.length - 1] });
    expect(litMap()).toEqual(only(SHIP_CLASS_IDS.length - 1));
  });

  it('re-clicking the already-highlighted card is a no-op', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click();
    (cards[1] as HTMLElement).click();
    expect(litMap()).toEqual(only(1));
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // still mounted
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Pins the bubbling assumption: the in-card SELECT button is part of the
  // whole-card click handler.
  it('clicking the in-card SELECT button itself highlights via bubbling', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    const pickBtn = cards[1].querySelector('.hc-pickbtn') as HTMLElement;
    pickBtn.click();
    expect(litMap()).toEqual(only(1));
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // still mounted
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('click card B then CONFIRM hands back class B and closes', () => {
    const { onConfirm } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click();
    confirmButton().click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(SECOND, DEFAULT_SHIFT);
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  it('click card B then ESC discards it — onClose fires, onConfirm never does', () => {
    const { onConfirm, onClose } = open();
    const layer = document.getElementById('hc-class-select') as HTMLElement;
    const cards = [...layer.querySelectorAll('.hc-ccard')];
    (cards[1] as HTMLElement).click();
    press('Escape');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull();
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

  // The window-level shortcut handler stays quiet for Enter/Space while a
  // layer button holds focus (Finding A narrowed the guard to ONLY those two
  // keys — ESC and arrows still reach the layer while a chip holds focus).
  it('Enter/Space stay swallowed by the window handler while a layer button holds focus; ESC and arrows still work regardless of focus', () => {
    const { onConfirm, onClose } = open();
    confirmButton().focus();
    press('Enter');
    expect(onConfirm).not.toHaveBeenCalled(); // the window shortcut did NOT steal Enter
    press(' ');
    expect(onConfirm).not.toHaveBeenCalled();

    const layer = document.getElementById('hc-class-select') as HTMLElement;
    expect(lit(0)).toBe(true);
    const chip = layer.querySelector('.hc-shiftchip') as HTMLButtonElement;
    chip.focus();
    press('ArrowRight'); // must move despite the chip (a BUTTON) holding focus
    expect(litMap()).toEqual(only(1));

    press('Escape'); // must still close despite focus
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });

  // Finding A regression pin: a chip click blurs the chip, so Enter reaches the
  // window handler again right after a real click.
  it('a Shift chip click still lets Enter confirm via the window handler afterward (Finding A)', () => {
    const { onConfirm } = open();
    const cards = [...document.querySelectorAll('#hc-class-select .hc-ccard')];
    const chip = cards[0].querySelector(`.hc-shiftchip[data-shift="${OTHER_SHIFT}"]`) as HTMLButtonElement;
    chip.focus();
    chip.click();
    expect(document.activeElement).not.toBe(chip); // blurred after the pick
    press('Enter');
    expect(onConfirm).toHaveBeenCalledWith(FIRST, OTHER_SHIFT);
  });
});

// --- Story 10.4: the SPECIAL row — ONE three-way Shift pick ---------------------

describe('the SPECIAL row — fit (Story 10.4)', () => {
  // THE CONTAINER-FIT LAW (amendment 47). The class bay is PORT chrome and does
  // not ride `--hc-ui-scale`, so one measurement holds at every UI scale.
  it('the SPECIAL key fits the loadout key column', () => {
    const micro = CLIENT_CONFIG.type.registers.hudMicro.size;
    expect(monoTextWidth(SPECIAL_KEY, micro, micro * LOADOUT_KEY_TRACKING_EM)).toBeLessThanOrEqual(LOADOUT_KEY_COL_PX);
  });

  it('each Shift chip alone fits the card\'s inner line (the row wraps between chips), above the 9 px floor', () => {
    for (const id of SHIFT_IDS) {
      const w = shiftChipWidth(id);
      expect(w, `${id} chip is ${w.toFixed(1)}px on a ${CARD_INNER_PX}px line`).toBeLessThanOrEqual(CARD_INNER_PX);
    }
    expect(CLIENT_CONFIG.type.registers.hudMicro.size).toBeGreaterThanOrEqual(CLIENT_CONFIG.settings.monoFloorPx);
  });
});

describe('openClassSelect — the Shift pick (Story 10.4)', () => {
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

  function chipsOf(card: Element): HTMLButtonElement[] {
    return [...card.querySelectorAll('.hc-shiftchip')] as HTMLButtonElement[];
  }
  function cards(): HTMLElement[] {
    return [...document.querySelectorAll('#hc-class-select .hc-ccard')] as HTMLElement[];
  }
  function pressedOf(card: Element): ShiftId[] {
    return chipsOf(card).filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.shift as ShiftId);
  }
  function confirm(): void {
    confirmButtonIn(document.getElementById('hc-class-select') as HTMLElement).click();
  }

  it('every card carries the three chips in SHIFT_IDS order, the default Shift lit alone', () => {
    openClassSelect({ initial: FIRST, blurTarget, onConfirm: vi.fn(), onClose: vi.fn() });
    for (const card of cards()) {
      expect(chipsOf(card).map((c) => c.dataset.shift)).toEqual([...SHIFT_IDS]);
      expect(pressedOf(card)).toEqual([DEFAULT_SHIFT]);
    }
  });

  // REVIEW GATE C4: the Shift is the captain's, independent of the hull — a
  // chip on another card moves the Shift ONLY; the highlighted hull stays. A
  // focused chip's Enter/Space is the same native `click` (the layer swallows
  // those keys while a button holds focus), so this pins keyboard activation too.
  it('a chip on card 3 while card 2 is selected moves the ONE pick on every card and leaves card 2 selected (review C4)', () => {
    const onConfirm = vi.fn();
    openClassSelect({ initial: SECOND, blurTarget, onConfirm, onClose: vi.fn() });
    expect(litMap()).toEqual(only(1));
    const target = chipsOf(cards()[2]).find((c) => c.dataset.shift === OTHER_SHIFT) as HTMLButtonElement;
    target.click();
    for (const card of cards()) expect(pressedOf(card)).toEqual([OTHER_SHIFT]);
    expect(litMap()).toEqual(only(1));
    confirm();
    expect(onConfirm).toHaveBeenCalledWith(SECOND, OTHER_SHIFT);
  });

  it('opens on the stored pick (initialShift)', () => {
    const onConfirm = vi.fn();
    openClassSelect({ initial: SECOND, initialShift: OTHER_SHIFT, blurTarget, onConfirm, onClose: vi.fn() });
    for (const card of cards()) expect(pressedOf(card)).toEqual([OTHER_SHIFT]);
    confirm();
    expect(onConfirm).toHaveBeenCalledWith(SECOND, OTHER_SHIFT);
  });
});

