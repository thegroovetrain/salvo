// Story 1.14 — home chrome: pure copy/status reducers plus DOM pins on
// showHome (first-run vs returning routing, chip copy, personal-color tint,
// inert-note pattern, status-line states). DOM assertions follow the repo
// pattern (build, assert textContent / attributes).
//
// Home-page maintenance patch re-takes pins DELIBERATELY: the home carries NO
// color picker (the class bay footer owns it), the chip carries NO loadout
// sub-line, and the callsign field + chip are TINTED with the ensured personal
// hue (which a pick in the bay repaints live).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  homeYieldStyle,
  livenessLines,
  loadSavedMode,
  queueButtonSubline,
  saveMode,
  serverStatusLine,
  showHome,
} from '../ui/home.js';
import type { LivenessPayload } from '@salvo/shared';
import { loadColorPref, __resetSessionColorPrefForTests } from '../net/connection.js';
import { HOME_TAGLINES } from '../ui/taglines.js';

// The connection module caches the session's rolled hue (review-gate fix for
// blocked-storage divergence); reset it per test so corrupt/absent-pref cases
// exercise a fresh roll instead of the previous test's cached one.
beforeEach(() => __resetSessionColorPrefForTests());
import { PLAYER_HUES } from '../render/ships.js';
import { cssHex } from '../util/color.js';

// --- pure reducers -----------------------------------------------------------

// RETIRED (Eric ruling 2026-08-17): the `deploySubline` block — "prompts a
// choice when no class is chosen" and "names the chosen class · SOLO" — is gone
// with the behaviour it pinned. The deploy buttons carry NO sub-line at all now
// ("I want the current 'PLAY' button to say 'SOLO' and nothing else"), so the
// reducer was deleted rather than reworded, and its tests are retired rather
// than bent onto new copy. The Story 6.5 `soloSubline` block went the same way,
// same ruling, same reason.

describe('serverStatusLine — probe reducer', () => {
  it('probing / ready are quiet, unreachable is denied', () => {
    expect(serverStatusLine('probing')).toEqual({ text: 'SERVER: CHECKING…', tone: 'tertiary' });
    expect(serverStatusLine('ready')).toEqual({ text: 'SERVER: READY', tone: 'tertiary' });
    expect(serverStatusLine('unreachable')).toEqual({ text: 'SERVER: UNREACHABLE', tone: 'denied' });
  });
});

// RETIRED (Eric rulings 2026-08-18): the `queueStatusLine` and
// `requeueStatusLine` blocks. Both reducers painted `h.statusEl`, the line beside
// HOW TO PLAY that the SERVER PROBE owns, and Eric struck the practice — *"Get
// rid of this information message that pops up next to 'HOW TO PLAY' and replaces
// the server status."* The queue's count and countdown live in the queue modal
// now (see queueModal.test.ts); the collapse register has NO replacement copy at
// all, so its three pins are retired rather than reworded onto a new string. The
// standing rule they leave behind is asserted below instead: no queue code may
// write to the status line.

// --- DOM: showHome -----------------------------------------------------------

function home(): HTMLElement {
  return document.getElementById('main-menu') as HTMLElement;
}

/** The MODE ROW's primary. Selected by TITLE, not by label text: the label is
 *  `SOLO` since Eric's 2026-08-17 ruling, which `SOLO VS AI` also contains. */
function playButton(): HTMLButtonElement {
  return home().querySelector('[title="Deploy alone against other captains"]') as HTMLButtonElement;
}

function soloButton(): HTMLButtonElement {
  return home().querySelector(
    '[title="Deploy alone against a field of AI captains"]',
  ) as HTMLButtonElement;
}

/** A mode button's big MODE label (child 0) and its Story 6.6 sub-line (child
 *  1). `textContent` on the button itself now concatenates both, so anything
 *  asserting the label alone has to go through these. */
function labelOf(btn: HTMLButtonElement): HTMLElement {
  return btn.children[0] as HTMLElement;
}

function sublineOf(btn: HTMLButtonElement): HTMLElement {
  return btn.children[1] as HTMLElement;
}

function nameInput(): HTMLInputElement {
  return home().querySelector('input') as HTMLInputElement;
}

function chip(): HTMLElement {
  return home().querySelector('[title="Open the class-select layer"]') as HTMLElement;
}

/** jsdom normalizes an assigned color ('#00d0ff') into its own serialization
 *  ('rgb(0, 208, 255)'). Round-trip the expected hex through a throwaway
 *  element so the comparison is serialization-agnostic. */
function normColor(css: string): string {
  const probe = document.createElement('div');
  probe.style.borderColor = css;
  return probe.style.borderColor;
}

/** Dispatch a keydown on the window (the layer's own listener target). */
function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

/** Dispatch a BUBBLING keydown on an element (models a real key event traveling
 *  up to any window listener — the vector for the insta-pick regression). */
function pressOn(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('showHome — first-run vs returning routing', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  // RE-TAKEN (Eric ruling 2026-08-17): the sub-line's "SELECT A CLASS TO DEPLOY"
  // prompt is RETIRED with the sub-line itself — the chip's own SELECT CLASS /
  // CHOOSE A HULL prompt is now the only first-run signal, and the routing it
  // guards (SOLO opens the bay instead of deploying) is unchanged.
  it('first run: the chip prompts SELECT CLASS and SOLO opens the layer (no deploy)', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    const text = home().textContent ?? '';
    expect(text).toContain('SELECT CLASS');
    expect(text).toContain('CHOOSE A HULL');
    expect(text).not.toContain('CLICK TO OPEN THE CLASS BAY'); // slimmed away with the sub-line
    expect(text).not.toContain('DEPLOY AS'); // no sub-line survives anywhere
    playButton().click();
    expect(onDeploy).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // layer opened
  });

  // RE-TAKEN pin (was "chip shows the class + loadout"): the chip is SLIM now —
  // silhouette, role tag, class name, CHANGE CLASS. No loadout sub-line.
  it('returning: chip shows the class with NO loadout sub-line, SOLO connects immediately', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    const text = home().textContent ?? '';
    expect(text).toContain('BATTLESHIP');
    expect(text).toContain('YOUR SHIP');
    expect(text).toContain('CHANGE CLASS');
    expect(text).not.toContain('STD GUN'); // the retired loadout sub-line
    expect(text).not.toContain('LONG-RANGE CANNON');
    // The chip is the ONLY place the hull is named now (Eric ruling 2026-08-17):
    // the button's "DEPLOY AS BATTLESHIP · SOLO" sub-line was restating it.
    expect(text).not.toContain('DEPLOY AS BATTLESHIP');
    playButton().click();
    expect(onDeploy).toHaveBeenCalledWith('', 'battleship'); // empty callsign → server assigns
    expect(document.getElementById('hc-class-select')).toBeNull(); // no layer, connected
  });

  // Container-fit law (amendment 47): below ~430px viewport width the class
  // name/divider must degrade with an ellipsis inside the chip's border box
  // rather than render past it. jsdom does no layout, so this pins the style
  // properties that make truncation possible (overflow/text-overflow/min-width)
  // rather than simulating the narrow viewport itself.
  it('the class name and CHANGE CLASS divider are styled to clip with an ellipsis, not overflow', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    showHome('0.0.0-test', vi.fn());
    const name = chip().querySelector('div') as HTMLElement;
    expect(name.style.overflow).toBe('hidden');
    expect(name.style.textOverflow).toBe('ellipsis');
    expect(name.style.minWidth).toBe('0px');
    expect(name.style.whiteSpace).toBe('nowrap');
    const divider = chip().children[2] as HTMLElement; // sil, meta, [change]
    expect(divider.textContent).toContain('CHANGE CLASS');
    expect(divider.style.overflow).toBe('hidden');
    expect(divider.style.textOverflow).toBe('ellipsis');
    expect(divider.style.minWidth).toBe('0px');
  });

  it('first-run SOLO → layer → pick updates the chip without deploying', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    playButton().click(); // opens the layer (TB pre-highlighted)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })); // highlight battleship
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); // pick it
    expect(onDeploy).not.toHaveBeenCalled();
    const text = home().textContent ?? '';
    expect(text).toContain('BATTLESHIP'); // the chip, which is now the only place it shows
    expect(text).not.toContain('SELECT CLASS'); // ...and the first-run prompt is gone
    expect(localStorage.getItem('hullcracker.class')).toBe('battleship'); // persisted
  });
});

// Story 6.5 — the port's SECOND door, on the row below the MODE ROW (Eric
// ruling 2026-08-17). DESIGN.md defines exactly one button (Primary: amber
// outline + glow) and has NO secondary spec, so these pins take the treatment
// the story ships: the results modal's two-action precedent ("the secondary is
// the same shape UNLIT"), phosphor rather than amber, and no ⏎ chip (Enter is
// bound to the SOLO primary only — the chip is a truthfulness rule).
describe('showHome — the SOLO VS AI button (Story 6.5)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  // REVISED DELIBERATELY BY STORY 6.6, NOT DELETED. The shipped pin asserted
  // `children.length === 1` on both buttons — a bare label, no sub-line —
  // because epic-6 amendment 31 struck the sub-lines. Eric has now ruled that
  // the queue's live counts ride ON these buttons, which reverses the SHAPE of
  // that amendment while honouring its REASON: what 31 struck was a sub-line
  // that RESTATED the Class Chip directly above it ("DEPLOY AS TORPEDO BOAT ·
  // SOLO"); a live queue count and countdown is information that exists nowhere
  // else on the page. So the pin now guards the intended structure — a label
  // plus exactly ONE sub-line slot — and, below, that neither sub-line names
  // the hull. Restoring `children.length === 1` would break Story 6.6.
  it('renders TWO mode buttons — a label plus ONE sub-line slot each', () => {
    localStorage.setItem('hullcracker.class', 'torpedoBoat');
    showHome('0.0.0-test', vi.fn());
    expect(soloButton()).not.toBeNull();
    expect(labelOf(soloButton()).textContent).toBe('SOLO VS AI');
    expect(labelOf(playButton()).textContent).toBe('SOLO'); // was PLAY, Eric ruling 2026-08-17
    expect(soloButton().children.length).toBe(2);
    expect(playButton().children.length).toBe(2);
    // Neither sub-line restates the Class Chip — the reason amendment 31 struck
    // the old ones. The chip is the only place the hull is ever named.
    for (const btn of [playButton(), soloButton()]) {
      expect(sublineOf(btn).textContent).not.toMatch(/TORPEDO BOAT|BATTLESHIP|MINE LAYER|DEPLOY AS/);
    }
  });

  it('is on its OWN row, below the mode row that will hold DUO and TRIO', () => {
    showHome('0.0.0-test', vi.fn());
    const modeRow = playButton().parentElement as HTMLElement;
    // Row 1 is a real flex ROW today with one button in it, so DUO/TRIO drop in
    // as siblings with no rewrite (Eric: "in-line with DUO and TRIO modes").
    expect(modeRow.style.flexDirection).toBe('row');
    expect(modeRow.style.justifyContent).toBe('center');
    expect(modeRow.style.flexWrap).toBe('wrap'); // never past the container edge
    expect([...modeRow.children]).toContain(playButton());
    expect([...modeRow.children]).not.toContain(soloButton());
    // Row 2 is the solo door, centered under it — a sibling of the row, not in it.
    const stack = modeRow.parentElement as HTMLElement;
    expect(stack.style.flexDirection).toBe('column');
    expect(stack.style.alignItems).toBe('center');
    expect([...stack.children]).toEqual([modeRow, soloButton()]);
  });

  it('sits AFTER the mode row in the DOM, so Tab reaches it in reading order', () => {
    showHome('0.0.0-test', vi.fn());
    const buttons = [...home().querySelectorAll('button')];
    expect(buttons.indexOf(soloButton())).toBe(buttons.indexOf(playButton()) + 1);
    // A real <button>: focusable and Enter/Space-activatable by the platform, so
    // it needs no role/tabindex shim — and it must never be taken OUT of tab
    // order by one.
    expect(soloButton().tagName).toBe('BUTTON');
    expect(soloButton().tabIndex).toBeGreaterThanOrEqual(0);
    expect(soloButton().hasAttribute('disabled')).toBe(false);
  });

  it('is the UNLIT secondary: phosphor outline, NO amber, NO glow', () => {
    showHome('0.0.0-test', vi.fn());
    expect(soloButton().style.borderColor).toBe('var(--hc-phosphor)');
    expect(soloButton().style.borderWidth).toBe('1px'); // outline, never a filled slab
    expect(soloButton().style.boxShadow).toBe(''); // the glow is the primary's alone
    // Amber is the ACTION register and DESIGN.md forbids it as decoration; it
    // must not appear anywhere on this control.
    expect(soloButton().getAttribute('style')).not.toContain('amber');
    const label = soloButton().firstElementChild as HTMLElement;
    expect(label.style.color).toBe('var(--hc-phosphor)');
    expect(label.style.letterSpacing).toBe('0.34em'); // mono uppercase, letter-spaced
    expect(label.textContent).toBe((label.textContent ?? '').toUpperCase());
  });

  it('the SOLO primary keeps the lit amber register beside it', () => {
    showHome('0.0.0-test', vi.fn());
    expect(playButton().style.borderColor).toBe('var(--hc-amber)');
    expect(playButton().style.boxShadow).not.toBe(''); // the primary's glow
    expect((playButton().firstElementChild as HTMLElement).style.color).toBe('var(--hc-amber)');
    // Both boxes are the same shape — the ONLY difference is lit vs unlit.
    //
    // REVISED (F10): the shipped pin compared `style.height`, which is `''` on
    // both buttons (neither pins a height — they HUG, see the container-fit
    // block below), so it passed vacuously while the two buttons genuinely
    // differed in rendered height before the first payload landed: one carried
    // a sub-line and one did not. Since F9 both reserve the slot permanently,
    // so the shape really is shared and can be asserted on the properties that
    // actually carry it.
    const shape = (b: HTMLButtonElement): Record<string, string> => ({
      width: b.style.width,
      maxWidth: b.style.maxWidth,
      minHeight: b.style.minHeight,
      padding: b.style.padding,
      boxSizing: b.style.boxSizing,
      borderRadius: b.style.borderRadius,
      borderWidth: b.style.borderWidth,
      borderStyle: b.style.borderStyle,
      display: b.style.display,
      flexDirection: b.style.flexDirection,
      alignItems: b.style.alignItems,
      justifyContent: b.style.justifyContent,
      // The sub-line slot is part of the shape: both buttons hold one, always
      // in flow, so availability of the queue count cannot make them differ.
      subline: sublineOf(b).style.display,
      children: String(b.children.length),
    });
    expect(shape(playButton())).toEqual(shape(soloButton()));
    expect(shape(playButton()).minHeight).toBe('64px'); // not vacuous: real values
    expect(shape(playButton()).subline).toBe('block');
    // ...and the whole difference between them is which register they wear.
    expect(playButton().style.borderColor).not.toBe(soloButton().style.borderColor);
  });

  it('carries NO ⏎ chip — Enter is bound to the SOLO primary only', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    showHome('0.0.0-test', vi.fn());
    expect(soloButton().textContent).not.toContain('⏎');
    expect(playButton().textContent).not.toContain('⏎');
  });

  it('Enter in the callsign field still runs the SOLO primary, never the solo-vs-AI door', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const onDeploy = vi.fn();
    const onSolo = vi.fn();
    showHome('0.0.0-test', onDeploy, vi.fn(), onSolo);
    const input = nameInput();
    input.focus();
    pressOn(input, 'Enter');
    expect(onDeploy).toHaveBeenCalledTimes(1);
    expect(onSolo).not.toHaveBeenCalled();
  });

  it('a click deploys through the SOLO door with the same callsign + class', () => {
    localStorage.setItem('hullcracker.class', 'mineLayer');
    const onDeploy = vi.fn();
    const onSolo = vi.fn();
    showHome('0.0.0-test', onDeploy, vi.fn(), onSolo);
    nameInput().value = 'skipper';
    soloButton().click();
    expect(onSolo).toHaveBeenCalledWith('skipper', 'mineLayer');
    expect(onDeploy).not.toHaveBeenCalled(); // the two doors never cross
    expect(localStorage.getItem('hullcracker.name')).toBe('skipper'); // callsign persisted
  });

  it('first run: the solo button opens the class bay instead of deploying', () => {
    const onSolo = vi.fn();
    showHome('0.0.0-test', vi.fn(), vi.fn(), onSolo);
    soloButton().click();
    expect(onSolo).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).not.toBeNull();
  });

  // RE-TAKEN (Eric ruling 2026-08-17): was "a class pick updates BOTH sub-lines".
  // There are no sub-lines now, so the pin becomes the inverse — a class pick
  // must leave the button labels ALONE, since they are mode labels, not context.
  it('a class pick in the bay leaves both button labels untouched', () => {
    showHome('0.0.0-test', vi.fn());
    playButton().click(); // first-run: opens the bay
    press('2'); // battleship
    press('Enter');
    expect(labelOf(playButton()).textContent).toBe('SOLO');
    expect(labelOf(soloButton()).textContent).toBe('SOLO VS AI');
    expect(home().textContent).toContain('BATTLESHIP'); // ...the chip took the pick
  });

  it('setBusy dims BOTH doors, and a busy solo press cannot start a second join', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const onSolo = vi.fn();
    const handle = showHome('0.0.0-test', vi.fn(), vi.fn(), onSolo);
    handle.setBusy(true);
    expect(soloButton().style.opacity).toBe('0.4');
    expect(playButton().style.opacity).toBe('0.4');
    soloButton().click();
    expect(onSolo).not.toHaveBeenCalled();
    handle.setBusy(false);
    expect(soloButton().style.opacity).toBe('1');
  });

  // R4 (no lie on screen): the solo path never enters the pool, so the queue's
  // waiting register must never appear on it — not before, not during, not after.
  it('never renders the queue-wait copy on the solo path', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const handle = showHome('0.0.0-test', vi.fn(), vi.fn(), vi.fn());
    soloButton().click();
    handle.setBusy(true);
    handle.setStatus('CONNECTING…', 'info');
    expect(home().textContent).toContain('CONNECTING…');
    expect(home().textContent).not.toContain('AWAITING A SECOND CAPTAIN');
    expect(home().textContent).not.toContain('QUEUED');
  });

  it('the solo button is never personal-tinted (it is a system register, like PLAY)', () => {
    localStorage.setItem('hullcracker.color', '8');
    showHome('0.0.0-test', vi.fn());
    const hue = normColor(cssHex(PLAYER_HUES[8]));
    expect(soloButton().style.borderColor).not.toBe(hue);
    expect(nameInput().style.borderColor).toBe(hue); // ...but the callsign still is
  });
});

describe('showHome — layer interaction guards (Story 1.14 review fixes)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  it('first-run Enter on the callsign field OPENS the layer without insta-picking (bubble guard)', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    const input = nameInput();
    input.focus();
    pressOn(input, 'Enter'); // the SAME keystroke that opens the layer must not reach it
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // layer opened
    expect(localStorage.getItem('hullcracker.class')).toBeNull(); // ...and no card was picked
    expect(onDeploy).not.toHaveBeenCalled();
  });

  it('Enter in the callsign field does NOT deploy while the layer is open (fix 4)', () => {
    localStorage.setItem('hullcracker.class', 'battleship'); // returning: Enter would normally deploy
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    chip().click(); // open the layer
    expect(document.getElementById('hc-class-select')).not.toBeNull();
    const input = nameInput();
    input.focus();
    pressOn(input, 'Enter');
    expect(onDeploy).not.toHaveBeenCalled();
  });

  it('hide() tears down an open layer — no orphaned window listener into the game (fix 6)', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const handle = showHome('0.0.0-test', vi.fn());
    chip().click();
    expect(document.getElementById('hc-class-select')).not.toBeNull();
    handle.hide();
    expect(document.getElementById('hc-class-select')).toBeNull(); // closed alongside the home
  });

  it('refocuses the callsign field after a layer pick so Enter=PLAY lives again (fix 8)', () => {
    showHome('0.0.0-test', vi.fn());
    playButton().click(); // first-run: opens the layer (blurs the input)
    press('2'); // highlight battleship
    press('Enter'); // pick it → layer closes
    expect(document.activeElement).toBe(nameInput());
  });
});

describe('showHome — the color picker is GONE from home (it lives in the class bay)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  // RE-TAKEN pin (was "a swatch click persists the hue connect() reads" ON HOME):
  // home carries no swatches at all now — the bay footer is the one picker.
  it('renders NO swatches and no hoist caption anywhere on the home surface', () => {
    showHome('0.0.0-test', vi.fn());
    expect(home().querySelectorAll('button[aria-label^="hue "]').length).toBe(0);
    expect(home().querySelector('button[aria-label="hue 9"]')).toBeNull();
    expect(home().textContent).not.toContain('COLOR PREFERENCE:');
    expect(home().textContent).not.toContain('PREFERENCE PICK');
  });

  it('mounting ENSURES a persisted personal hue (first visit rolls + writes it)', () => {
    showHome('0.0.0-test', vi.fn());
    const idx = loadColorPref();
    expect(idx).not.toBeUndefined();
    expect(localStorage.getItem('hullcracker.color')).toBe(String(idx));
  });

  it('tints the callsign field + chip with the ensured personal color (no amber accents)', () => {
    localStorage.setItem('hullcracker.color', '8'); // cyan — deterministic
    localStorage.setItem('hullcracker.class', 'battleship');
    showHome('0.0.0-test', vi.fn());
    const hue = normColor(cssHex(PLAYER_HUES[8]));
    expect(nameInput().style.borderColor).toBe(hue);
    expect(chip().style.borderColor).toBe(hue);
    expect(chip().style.boxShadow).not.toBe(''); // personal-hue glow
  });

  it('the callsign focus ring is the personal color, and it lifts on blur', () => {
    localStorage.setItem('hullcracker.color', '8');
    showHome('0.0.0-test', vi.fn());
    const input = nameInput();
    input.focus();
    expect(input.style.boxShadow).not.toBe('none');
    expect(input.style.boxShadow).not.toBe('');
    input.blur();
    expect(input.style.boxShadow).toBe('none');
  });

  it('a pick in the class bay repaints the home tint live (modal → home)', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    showHome('0.0.0-test', vi.fn());
    chip().click(); // open the bay
    const swatch = document.querySelector('#hc-class-select button[aria-label="hue 9"]') as HTMLButtonElement;
    swatch.click(); // idx 8 = cyan
    expect(localStorage.getItem('hullcracker.color')).toBe('8');
    expect(loadColorPref()).toBe(8);
    const hue = normColor(cssHex(PLAYER_HUES[8]));
    expect(chip().style.borderColor).toBe(hue);
    expect(nameInput().style.borderColor).toBe(hue);
  });

  // The accent repaint must never write a personal hue onto a deploy button,
  // while the chip/callsign both get one. (The amber outline itself is readable
  // now that the border is assigned as separate properties rather than inside a
  // `border:1px solid var(--x)` blob, which jsdom's cssstyle voids wholesale.)
  it('the SOLO primary is never personal-tinted — the amber action register stays amber', () => {
    localStorage.setItem('hullcracker.color', '8');
    showHome('0.0.0-test', vi.fn());
    const hue = normColor(cssHex(PLAYER_HUES[8]));
    expect(playButton().style.borderColor).not.toBe(hue);
    expect(playButton().style.boxShadow).not.toContain(hue);
    expect(nameInput().style.borderColor).toBe(hue); // ...but the callsign does
  });

  it('the phosphor status line keeps its own register (never personal-tinted)', () => {
    localStorage.setItem('hullcracker.color', '8');
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setServerProbe('ready');
    const status = [...home().querySelectorAll('span')].find((s) => s.textContent === 'SERVER: READY') as HTMLElement;
    expect(status.style.color).toBe('var(--hc-phosphor)');
  });
});

describe('showHome — CONFIRM SELECTION saves the class WITHOUT deploying', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  function confirmButton(): HTMLButtonElement {
    return [...document.querySelectorAll('#hc-class-select button')].find(
      (b) => b.textContent === 'CONFIRM SELECTION',
    ) as HTMLButtonElement;
  }

  it('click: class persisted, bay closes back to port, NO connection attempted', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    playButton().click(); // first-run SOLO opens the bay (TB pre-highlighted)
    press('3'); // highlight mineLayer
    confirmButton().click();
    expect(localStorage.getItem('hullcracker.class')).toBe('mineLayer');
    expect(onDeploy).not.toHaveBeenCalled(); // the buttons are the ONLY deploy path
    expect(document.getElementById('hc-class-select')).toBeNull();
    expect(home().textContent).toContain('MINE LAYER'); // the chip took the pick
  });

  it('Enter in the bay confirms the same way (no deploy)', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    playButton().click();
    press('2'); // battleship
    press('Enter');
    expect(localStorage.getItem('hullcracker.class')).toBe('battleship');
    expect(onDeploy).not.toHaveBeenCalled();
  });

  it('ESC still closes with the class unchanged (semantics untouched)', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    chip().click();
    press('3'); // move the highlight to mineLayer — ESC must not commit it
    press('Escape');
    expect(localStorage.getItem('hullcracker.class')).toBe('battleship');
    expect(onDeploy).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).toBeNull();
  });
});

describe('showHome — the settings gear (Story 2.3: the inert note is gone)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => home()?.remove());

  it('gear click fires the settings callback — no "later refit" note survives', () => {
    const onSettings = vi.fn();
    showHome('0.0.0-test', vi.fn(), onSettings);
    (home().querySelector('[title="Settings"]') as HTMLElement).click();
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(home().textContent).not.toContain('SETTINGS ARRIVE IN A LATER REFIT');
  });

  it('home ESC toggles settings too (mirrors the gear and the in-match ESC)', () => {
    const onSettings = vi.fn();
    showHome('0.0.0-test', vi.fn(), onSettings);
    nameInput().blur();
    press('Escape');
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('ESC in the callsign field is left to the field, not the overlay', () => {
    const onSettings = vi.fn();
    showHome('0.0.0-test', vi.fn(), onSettings);
    nameInput().focus();
    press('Escape');
    expect(onSettings).not.toHaveBeenCalled();
  });

  // --- REGRESSION (Story 2.3 review gate): the home must YIELD --------------
  // The ratified z register puts the settings overlay (1050) UNDER this
  // fullscreen home (1100), which hit-tests every pixel — so from the gear the
  // panel was both obscured AND unclickable (every click landed on the home).

  it('homeYieldStyle: hidden + inert while settings is open, restored when it closes', () => {
    expect(homeYieldStyle(true)).toEqual({ visibility: 'hidden', pointerEvents: 'none' });
    expect(homeYieldStyle(false)).toEqual({ visibility: 'visible', pointerEvents: 'auto' });
  });

  it('setYielded takes the whole home surface out of hit-testing, and puts it back', () => {
    const handle = showHome('0.0.0-test', vi.fn(), vi.fn());
    handle.setYielded(true);
    expect(home().style.visibility).toBe('hidden');
    expect(home().style.pointerEvents).toBe('none');
    handle.setYielded(false);
    expect(home().style.visibility).toBe('visible');
    expect(home().style.pointerEvents).toBe('auto');
  });

  it('reverse stacking holds: PLAY and the class chip are unreachable while yielded', () => {
    const onDeploy = vi.fn();
    const handle = showHome('0.0.0-test', onDeploy, vi.fn());
    handle.setYielded(true);
    // `pointer-events: none` is what makes this true in a real browser; the
    // style IS the contract (jsdom dispatches clicks regardless of hit-testing).
    expect(home().style.pointerEvents).toBe('none');
    expect(home().style.visibility).toBe('hidden');
    expect(onDeploy).not.toHaveBeenCalled();
  });

  it('a focused VOLUME SLIDER does not swallow home ESC (only text fields do)', () => {
    const onSettings = vi.fn();
    showHome('0.0.0-test', vi.fn(), onSettings);
    const range = document.createElement('input');
    range.type = 'range';
    document.body.appendChild(range);
    range.focus();
    press('Escape');
    expect(onSettings).toHaveBeenCalledTimes(1);
    range.remove();
  });

  // --- Eric 2026-08-18: ESC while the QUEUE MODAL is open ---------------------

  it('ESC CANCELS THE QUEUE while the modal is open, and never opens settings there', () => {
    // Eric ruling 2026-08-18: "ESC could/should cancel the queue and close the
    // modal." It goes through the SAME canceller the CANCEL button uses, so a
    // pooled wait has ONE exit rather than two that can drift.
    //
    // It must not ALSO toggle settings: the ratified z register puts settings at
    // 1050, UNDER the modal at 1150, and the modal is not part of the home
    // overlay so setYielded cannot hide it — an ESC that opened settings here
    // would raise a panel the player could neither see nor click.
    const onSettings = vi.fn();
    const cancel = vi.fn();
    const handle = showHome('0.0.0-test', vi.fn(), onSettings);
    handle.setCancel(cancel);
    nameInput().blur();
    press('Escape');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onSettings).not.toHaveBeenCalled();
    // Tearing the modal down is the CANCELLER's business (it rejects `connect`,
    // which drives `setCancel(null)`) — not this handler's, which is why the
    // modal is still standing here with only a stubbed canceller.
    expect(document.getElementById('queue-modal')).not.toBeNull();
    // ...and settings comes straight back once the modal is gone.
    handle.setCancel(null);
    press('Escape');
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1); // not called a second time
    document.getElementById('queue-modal')?.remove();
  });

  it('HOW TO PLAY still shows the field-manual note (out of 2.3 scope)', () => {
    showHome('0.0.0-test', vi.fn());
    const howto = [...home().querySelectorAll('span')].find((s) => s.textContent === 'HOW TO PLAY') as HTMLElement;
    howto.click();
    expect(home().textContent).toContain('FIELD MANUAL ARRIVES IN A LATER REFIT');
  });
});

// Cycle 87 — the wordmark tagline is now a random draw from HOME_TAGLINES
// instead of the fixed "LAST HULL FLOATING WINS" line (Eric ruling
// 2026-08-14: the win-condition copy moves to HOW TO PLAY and does not join
// the pool). Style/position pins per amendment 47 (container-fit).
describe('showHome — wordmark tagline (cycle 87: random pun, not a fixed line)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => home()?.remove());

  function wordmarkChildren(): HTMLElement[] {
    return [...(home().children[0] as HTMLElement).children] as HTMLElement[];
  }

  it('renders a HOME_TAGLINES member, not the retired win-condition line', () => {
    showHome('0.0.0-test', vi.fn());
    const [, tagline] = wordmarkChildren();
    expect(HOME_TAGLINES).toContain(tagline.textContent);
    expect(home().textContent).not.toContain('LAST HULL FLOATING WINS');
  });

  it('wordmark is still exactly [mark, tagline, ver], style untouched', () => {
    showHome('0.0.0-test', vi.fn());
    const [mark, tagline, ver] = wordmarkChildren();
    expect(wordmarkChildren().length).toBe(3);
    expect(mark.textContent).toContain('HULLCRACKER');
    expect(ver.textContent).toContain('RT PROTOTYPE');
    expect(tagline.style.letterSpacing).toBe('0.44em');
    expect(tagline.style.marginTop).toBe('8px');
    expect(tagline.style.color).toBe('var(--hc-phosphor)');
  });
});

describe('showHome — status-line states via the handle', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => home()?.remove());

  it('boots probing, then reflects probe + connect states', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    expect(home().textContent).toContain('SERVER: CHECKING…');
    handle.setServerProbe('ready');
    expect(home().textContent).toContain('SERVER: READY');
    handle.setServerProbe('unreachable');
    expect(home().textContent).toContain('SERVER: UNREACHABLE');
    handle.setStatus('CONNECTING…', 'info');
    expect(home().textContent).toContain('CONNECTING…');
  });

  it('a connect-flow status write locks out a late server-probe resolution (fix 2)', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setStatus('LINK REFUSED', 'denied'); // a connect failure claims the line
    handle.setServerProbe('ready'); // ...a probe that resolves afterward
    expect(home().textContent).toContain('LINK REFUSED'); // is ignored — error stays visible
    expect(home().textContent).not.toContain('SERVER: READY');
  });

  it('setBusy dims + un-dims the PLAY button', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setBusy(true);
    expect(playButton().style.opacity).toBe('0.4');
    handle.setBusy(false);
    expect(playButton().style.opacity).toBe('1');
  });

  it('a PLAY press mid-queue RE-ASSERTS the live line rather than stamping CONNECTING…', () => {
    // Never-silence, without blanking the queue readout: the line only refreshes
    // when the server pushes, so a fixed CONNECTING… would hide the countdown
    // until the next push.
    localStorage.setItem('hullcracker.class', 'battleship');
    const onDeploy = vi.fn();
    const handle = showHome('0.0.0-test', onDeploy);
    handle.setBusy(true);
    handle.setStatus('QUEUED 2 CAPTAINS · DEPLOY IN 1:05', 'info');
    playButton().click();
    expect(onDeploy).not.toHaveBeenCalled(); // still busy — no second join
    expect(home().textContent).toContain('QUEUED 2 CAPTAINS · DEPLOY IN 1:05');
    expect(home().textContent).not.toContain('CONNECTING…');
  });
});

describe('showHome — setCancel drives the QUEUE MODAL (Story 6.1 plumbing, Eric 2026-08-18)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('queue-modal')?.remove();
  });

  function modal(): HTMLElement | null {
    return document.getElementById('queue-modal');
  }

  function modalCancel(): HTMLButtonElement {
    return document.getElementById('queue-modal-cancel') as HTMLButtonElement;
  }

  it('opens the modal with a canceller and closes it again with null', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    expect(modal()).toBeNull();
    handle.setCancel(vi.fn());
    expect(modal()).not.toBeNull();
    handle.setCancel(null);
    expect(modal()).toBeNull();
  });

  it('THE HOME CARRIES NO CANCEL OF ITS OWN — the underplay span is retired', () => {
    // It lived in the HOW TO PLAY row, which the modal now covers, so it could
    // never have been seen or clicked while it was meaningful. Deleted rather
    // than left invisible (the no-dead-knobs rule).
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setCancel(vi.fn());
    expect(home().querySelector('[title="Leave the queue"]')).toBeNull();
    expect(home().textContent).not.toContain('CANCEL');
  });

  it('CANCEL fires the canceller AND closes the modal in the same press', () => {
    const cancel = vi.fn();
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setCancel(cancel);
    modalCancel().click();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(modal()).toBeNull(); // instant, not waiting on connect() to reject
  });

  it('a re-open never stacks a second overlay', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setCancel(vi.fn());
    handle.setCancel(vi.fn());
    expect(document.querySelectorAll('#queue-modal').length).toBe(1);
  });

  it('hide() takes the modal with it — it is a SIBLING of the home overlay', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setCancel(vi.fn());
    handle.hide();
    expect(modal()).toBeNull();
  });
});

// --- Story 6.6: the liveness register + the mode-button sub-lines ------------

/** A well-formed `/liveness` payload, with its deadline ALREADY localized to
 *  the client clock (net/liveness.ts does that at the boundary). */
function livePayload(over: Partial<LivenessPayload> = {}): LivenessPayload {
  return {
    playersOnline: 23,
    liveGames: 2,
    queue: { pooled: 3, min: 2, cap: 20, deadlineAt: null },
    modes: { standard: { players: 20, games: 1 }, soloVsAi: { players: 3, games: 1 } },
    serverNow: 1_000_000,
    ...over,
  };
}

describe('livenessLines — the top-left global register', () => {
  it('renders the honest ZERO rather than hiding (Eric ruling)', () => {
    // "Nobody is here yet" is a fact the player needs at beta population;
    // hiding it is what makes an empty server read as a broken one.
    expect(livenessLines(livePayload({ playersOnline: 0, liveGames: 0 }))).toEqual({
      players: 'PLAYERS ONLINE: 0',
      games: 'LIVE GAMES: 0',
    });
  });

  it("is Eric's copy, in his order, uppercase", () => {
    const lines = livenessLines(livePayload({ playersOnline: 23, liveGames: 2 }));
    expect(lines).toEqual({ players: 'PLAYERS ONLINE: 23', games: 'LIVE GAMES: 2' });
    expect(lines?.players).toBe(lines?.players.toUpperCase());
  });

  it('is the ONE absence: an unavailable read renders nothing at all', () => {
    expect(livenessLines(null)).toBeNull();
  });

  it('carries no per-mode breakdown — that ships in the endpoint only (Eric)', () => {
    const lines = livenessLines(livePayload());
    expect(`${lines?.players} ${lines?.games}`).not.toMatch(/SOLO|AI|STANDARD/);
  });
});

describe("queueButtonSubline — the SOLO door's sub-line is `N/20 QUEUED`, FULL STOP", () => {
  it("is Eric's copy verbatim and nothing else", () => {
    // Eric ruling 2026-08-18: *"I didn't ask you to add 'NEEDS 2 TO START'...
    // Just make it say 'N/20 Queued' where N is the number in queue."*
    expect(queueButtonSubline({ pooled: 1, min: 2, cap: 20, deadlineAt: null })).toBe('1/20 QUEUED');
    expect(queueButtonSubline({ pooled: 0, min: 2, cap: 20, deadlineAt: null })).toBe('0/20 QUEUED');
    expect(queueButtonSubline({ pooled: 20, min: 2, cap: 20, deadlineAt: null })).toBe('20/20 QUEUED');
  });

  it('takes the CAP off the payload, never a client-side 20', () => {
    // `cap` is CONFIG.map.playerCap; a restated literal starts lying the day it
    // is retuned — the same failure that took the invented `min` out of here.
    expect(queueButtonSubline({ pooled: 3, min: 2, cap: 12, deadlineAt: null })).toBe('3/12 QUEUED');
  });

  // THE RETIRED STATE MACHINE MUST NOT COME BACK. These four are the whole
  // substance of the ruling: no threshold clause, no `STARTING`, no clock, and no
  // second clause of any kind — in ANY state of the payload, armed or not.
  it('NEVER says NEEDS, NEVER says STARTING, and NEVER carries a countdown', () => {
    const states: Array<NonNullable<LivenessPayload['queue']>> = [
      { pooled: 0, min: 2, cap: 20, deadlineAt: null },
      { pooled: 1, min: 2, cap: 20, deadlineAt: null },
      { pooled: 2, min: 2, cap: 20, deadlineAt: null }, // the old `STARTING` state
      { pooled: 4, min: 2, cap: 20, deadlineAt: 1_083_000 }, // armed
      { pooled: 1, min: 2, cap: 20, deadlineAt: 1_083_000 }, // armed below min
      { pooled: 20, min: 2, cap: 20, deadlineAt: null },
    ];
    for (const q of states) {
      const line = queueButtonSubline(q);
      expect(line).not.toMatch(/NEEDS/);
      expect(line).not.toMatch(/STARTING/);
      expect(line).not.toMatch(/STARTS/);
      expect(line).not.toMatch(/\d:\d\d/); // no m:ss anywhere
      expect(line).not.toContain('·'); // exactly ONE clause, so no separator
      expect(line).toBe(`${q.pooled}/${q.cap} QUEUED`);
    }
  });

  it('is INDIFFERENT to the deadline — an armed pool reads identically', () => {
    // The deadline is not an input any more (the reducer takes one argument), so
    // this cannot regress into a countdown by accident.
    expect(queueButtonSubline({ pooled: 4, min: 2, cap: 20, deadlineAt: 1_083_000 })).toBe(
      queueButtonSubline({ pooled: 4, min: 2, cap: 20, deadlineAt: null }),
    );
    expect(queueButtonSubline.length).toBe(1); // no `nowMs` parameter to pass
  });

  it('says NOTHING when the payload carries no queue block at all', () => {
    // Only reachable from an older or foreign server (ours always emits the
    // block, filling the no-room case itself), and inventing numbers there is
    // exactly what was wrong with the retired version.
    expect(queueButtonSubline(null)).toBe('');
  });
});

describe('showHome — the liveness surfaces (Story 6.6)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  /** The BOTTOM-left population block. */
  function livenessBlock(): HTMLElement {
    return [...home().children].find(
      (el) => (el as HTMLElement).style.left === '26px',
    ) as HTMLElement;
  }

  it('is BOTTOM-LEFT, out of the port column, and CANNOT collide with the wordmark', () => {
    // Eric ruling 2026-08-18. At `top:22px` this block overlapped the wordmark
    // below a ~768px-tall viewport (verified by screenshot at 1280×720): the port
    // column is centered and the wordmark is its tallest member, so the two
    // corners fought for the same pixels. The bottom of the column is empty at
    // every size measured. Same 22/26 insets, `bottom` instead of `top`.
    showHome('0.0.0-test', vi.fn());
    const block = livenessBlock();
    const gear = [...home().children].find((el) => el.textContent === '⚙') as HTMLElement;
    expect(block.style.position).toBe('absolute'); // costs the rigid column zero height
    expect(block.style.bottom).toBe('22px');
    expect(block.style.top).toBe(''); // the collision: never anchored to the top again
    expect(block.style.left).toBe('26px');
    // The gear did NOT move — it is still the top-right corner.
    expect(gear.style.top).toBe('22px');
    expect(gear.style.right).toBe('26px');
  });

  it('is still a readout: no pointer events, and it still renders the honest zero', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    expect(livenessBlock().style.pointerEvents).toBe('none');
    handle.setLiveness(livePayload({ playersOnline: 0, liveGames: 0 }));
    expect(livenessBlock().textContent).toContain('PLAYERS ONLINE: 0');
  });

  it('does not render at all until a payload arrives, and hides again on an outage', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    expect(livenessBlock().style.display).toBe('none');
    // The SUB-LINE hides by VISIBILITY, not by leaving the flow (F9) — see the
    // layout-shift block below.
    expect(sublineOf(playButton()).style.visibility).toBe('hidden');
    handle.setLiveness(livePayload());
    expect(livenessBlock().style.display).toBe('flex');
    expect(sublineOf(playButton()).style.visibility).toBe('visible');
    handle.setLiveness(null);
    expect(livenessBlock().style.display).toBe('none');
    expect(sublineOf(playButton()).style.visibility).toBe('hidden');
  });

  it('paints the two lines, PLAYERS ONLINE over LIVE GAMES', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(livePayload({ playersOnline: 23, liveGames: 2 }));
    const [players, games] = [...livenessBlock().children] as HTMLElement[];
    expect(players.textContent).toBe('PLAYERS ONLINE: 23');
    expect(games.textContent).toBe('LIVE GAMES: 2');
  });

  it('renders a genuine ZERO rather than disappearing', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    // The empty-server payload as the SERVER now sends it: an emitted queue
    // block with a pool of zero, never a null the client has to guess at (F7).
    handle.setLiveness(
      livePayload({
        playersOnline: 0,
        liveGames: 0,
        queue: { pooled: 0, min: 2, cap: 20, deadlineAt: null },
      }),
    );
    expect(livenessBlock().style.display).toBe('flex');
    expect(livenessBlock().textContent).toContain('PLAYERS ONLINE: 0');
    expect(sublineOf(playButton()).textContent).toBe('0/20 QUEUED');
  });

  it('is Geist Mono, uppercase, and NEVER text-muted (DESIGN.md:153, load-bearing numbers)', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(livePayload());
    for (const el of [...livenessBlock().children] as HTMLElement[]) {
      expect(el.style.font).toContain('var(--hc-font-mono)');
      expect(el.style.textTransform).toBe('uppercase');
      expect(el.style.color).toBe('var(--hc-phosphor)');
      expect(el.getAttribute('style')).not.toContain('text-muted');
    }
  });

  it('SOLO VS AI carries the CONSTANT steer — true with or without a server answer', () => {
    showHome('0.0.0-test', vi.fn());
    // Never data-driven: this door creates its own room, so there is no pool to
    // count. It is the way out of a dead queue.
    expect(sublineOf(soloButton()).textContent).toBe('STARTS INSTANTLY');
    expect(sublineOf(soloButton()).style.display).toBe('block');
  });

  it("an outage leaves SOLO VS AI's steer standing — it needs no liveness", () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(null);
    expect(sublineOf(soloButton()).textContent).toBe('STARTS INSTANTLY');
  });

  // REPLACES the three tick pins retired with the countdown (Eric ruling
  // 2026-08-18). The sub-line is a bare count now, so the home must run NO
  // interval in ANY state — armed, unarmed or absent. That is stronger than the
  // old "no timer while unarmed" pin, and it retires the whole leak class the old
  // one guarded (the tick closed over the home and had to be cleared by hide(),
  // by setLiveness(null), and on every path in between).
  it('runs NO 1Hz timer in ANY state — the home has no clock at all any more', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const handle = showHome('0.0.0-test', vi.fn());
    for (const q of [
      { pooled: 1, min: 2, cap: 20, deadlineAt: null },
      { pooled: 4, min: 2, cap: 20, deadlineAt: 1_083_000 }, // armed: used to tick
      null,
    ]) {
      handle.setLiveness(livePayload({ queue: q }));
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    handle.hide();
  });

  it('an armed payload paints the same bare count — no clock reaches the button', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(livePayload({ queue: { pooled: 4, min: 2, cap: 20, deadlineAt: 1_083_000 } }));
    const sub = sublineOf(playButton());
    expect(sub.textContent).toBe('4/20 QUEUED');
    vi.advanceTimersByTime(30_000); // 30s of clock changes nothing at all
    expect(sub.textContent).toBe('4/20 QUEUED');
    handle.hide();
    vi.useRealTimers();
  });

  it('the mode buttons hug their content, so a sub-line cannot overflow the box', () => {
    // Amendment 47 (the container-fit law): a FIXED height would clip the
    // sub-line 6.6 puts back. `min-height` + border-box padding satisfies both
    // the with-sub-line and the without-sub-line states from one rule.
    showHome('0.0.0-test', vi.fn());
    for (const btn of [playButton(), soloButton()]) {
      expect(btn.style.height).toBe('');
      expect(btn.style.minHeight).toBe('64px');
      expect(btn.style.boxSizing).toBe('border-box');
    }
  });
});

describe('hullcracker.mode persistence (Story 6.6)', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips both doors of the DeployMode union', () => {
    saveMode('soloVsAi');
    expect(loadSavedMode()).toBe('soloVsAi');
    saveMode('standard');
    expect(loadSavedMode()).toBe('standard');
  });

  it('is NULL when nothing is stored — the caller decides the default', () => {
    expect(loadSavedMode()).toBeNull();
  });

  it('IGNORES anything outside the union (corrupt / hand-edited / a future mode)', () => {
    localStorage.setItem('hullcracker.mode', 'duo');
    expect(loadSavedMode()).toBeNull();
    localStorage.setItem('hullcracker.mode', '{"mode":"soloVsAi"}');
    expect(loadSavedMode()).toBeNull();
  });

  it('fails OPEN when storage throws (private mode, blocked storage)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSavedMode()).toBeNull();
    expect(() => saveMode('soloVsAi')).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

// --- F9: availability of a number must never reflow the deploy stack --------

describe('the mode-button sub-line reserves its space (F9)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  it('keeps the empty slot IN FLOW — hidden, never removed', () => {
    // `display:none` took the span out of flow, so both deploy buttons grew by
    // a line the moment the first payload landed and jittered every 10s on a
    // flaky connection — with the PRIMARY BUTTON moving between a click's
    // mousedown and its mouseup.
    showHome('0.0.0-test', vi.fn());
    const sub = sublineOf(playButton());
    expect(sub.style.display).toBe('block'); // in flow with nothing to say
    expect(sub.style.visibility).toBe('hidden');
    // ...and it is one line TALL even while empty: an empty inline box has no
    // height at all, so the reservation needs a character in it.
    expect(sub.textContent).toBe(' ');
  });

  it('a payload arriving, and going away again, never changes `display`', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    const sub = sublineOf(playButton());
    const before = sub.style.display;
    handle.setLiveness(livePayload({ queue: { pooled: 1, min: 2, cap: 20, deadlineAt: null } }));
    expect(sub.style.display).toBe(before);
    expect(sub.style.visibility).toBe('visible');
    expect(sub.textContent).toBe('1/20 QUEUED');
    handle.setLiveness(null); // an outage: the copy goes, the box does not
    expect(sub.style.display).toBe(before);
    expect(sub.style.visibility).toBe('hidden');
    expect(sub.textContent).toBe(' ');
  });

  it('holds the reservation on BOTH doors, in every state', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    for (const state of [null, livePayload(), livePayload({ queue: null })]) {
      handle.setLiveness(state);
      for (const btn of [playButton(), soloButton()]) {
        expect(btn.children.length).toBe(2);
        expect(sublineOf(btn).style.display).toBe('block');
        expect(sublineOf(btn).textContent).not.toBe('');
      }
    }
  });
});

// --- F3: committing to a deploy clears the paint, not just the poll ----------

describe('setLiveness(null) stands the whole surface down (F3)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
    vi.useRealTimers();
  });

  it('clears the register AND the sub-line', () => {
    // This is the value main.ts pushes when the player commits: `Home` has no
    // other way to be told "stand down", and a stale count on the button behind
    // the queue modal would contradict the live one inside it.
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(livePayload({ queue: { pooled: 4, min: 2, cap: 20, deadlineAt: 1_083_000 } }));
    const sub = sublineOf(playButton());
    expect(sub.textContent).toBe('4/20 QUEUED');

    handle.setLiveness(null);
    expect(sub.style.visibility).toBe('hidden');
    expect(sub.textContent).toBe(' ');
    // ...and 30s of clock cannot resurrect it: there is no timer left to do so.
    vi.advanceTimersByTime(30_000);
    expect(sub.textContent).toBe(' ');
    handle.hide();
  });
});

// --- Eric 2026-08-18: the status line beside HOW TO PLAY belongs to the PROBE --

describe('the status line is NEVER written by queue code', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('queue-modal')?.remove();
  });

  /** The underplay LINK row — HOW TO PLAY's parent. */
  function underplay(): HTMLElement {
    return [...home().querySelectorAll('span')].find((s) => s.textContent === 'HOW TO PLAY')
      ?.parentElement as HTMLElement;
  }

  /** The status line is the link row's SIBLING now, not its second child
   *  (Eric ruling 2026-08-18, Story 7.2 — see `makeUnderplay`). */
  function statusText(): string {
    return (underplay().parentElement?.children[1] as HTMLElement).textContent ?? '';
  }

  it('the underplay row is the two static-page links, and nothing else', () => {
    // The CANCEL span that used to be a third child moved into the modal
    // (Eric ruling 2026-08-18). The row is still exactly two children, but the
    // SECOND one changed: Story 7.2 added PRIVACY beside HOW TO PLAY and moved
    // the server status onto its own line beneath, on Eric's ruling. The pin is
    // therefore intact in spirit — the row is navigation and nothing else — and
    // the status register is asserted separately just below.
    showHome('0.0.0-test', vi.fn());
    expect(underplay().children.length).toBe(2);
    expect([...underplay().children].map((c) => c.textContent)).toEqual(['HOW TO PLAY', 'PRIVACY']);
    expect(statusText()).toBe('SERVER: CHECKING…');
  });

  it('PRIVACY is a REAL anchor to /privacy, not a scripted span', () => {
    // Load-bearing rather than cosmetic: AdSense site review and Google's CMP
    // setup both want a reachable, crawlable privacy-policy URL, and a span
    // that calls location.href is not one.
    showHome('0.0.0-test', vi.fn());
    const link = [...underplay().children].find((c) => c.textContent === 'PRIVACY');
    expect(link?.tagName).toBe('A');
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/privacy');
  });

  it('setServerProbe owns it, and the whole queue lifecycle does not disturb it', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setServerProbe('ready');
    expect(statusText()).toBe('SERVER: READY');
    // Join, an unarmed push, an armed push, a poll read, then leave.
    handle.setCancel(vi.fn());
    handle.setQueue({ n: 1, min: 2, cap: 20, startsInMs: null });
    handle.setQueue({ n: 7, min: 2, cap: 20, startsInMs: 65_000 });
    handle.setLiveness(livePayload({ queue: { pooled: 7, min: 2, cap: 20, deadlineAt: 1_083_000 } }));
    expect(statusText()).toBe('SERVER: READY'); // untouched by every one of them
    handle.setCancel(null);
    expect(statusText()).toBe('SERVER: READY');
  });

  it('and no retired queue copy can reach the home surface at all', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setServerProbe('ready');
    handle.setCancel(vi.fn());
    handle.setQueue({ n: 1, min: 2, cap: 20, startsInMs: null });
    const text = home().textContent ?? '';
    expect(text).not.toMatch(/AWAITING A SECOND CAPTAIN/);
    expect(text).not.toMatch(/DEPLOY IN/);
    expect(text).not.toMatch(/LOBBY DISBANDED|SEARCHING FOR A NEW MATCH/);
    expect(text).not.toMatch(/NEEDS|STARTING/);
  });
});

// main.ts is the bootstrap and cannot be imported into a test (it builds the
// Pixi stage on import), so its lifecycle is pinned as SOURCE — the same idiom
// sessionLock.test.ts uses for "which function claims the lock".
describe('main.ts stands liveness down at the deploy door (F3)', () => {
  // vitest's root is the client workspace dir, so process.cwd() === client/ —
  // the same resolution tokens.test.ts and sessionLock.test.ts use.
  const mainSrc = (): string => readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

  /** A top-level function body, by this file's own formatting (closing brace in
   *  column 0). Good enough to say WHICH function a call lives in. */
  function bodyOf(src: string, signature: string): string {
    const start = src.indexOf(signature);
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n}\n', start);
    return src.slice(start, end);
  }

  it('stopHomeLiveness is GONE, not kept for a future caller', () => {
    // Eric's 2026-08-18 ruling removed its only call site: the door demotes the
    // poll instead of killing it, and the stop at home.hide() needs no repaint
    // because the home is already torn down. Leaving a stop-and-blank helper
    // lying around would be a dead knob AND a trap — calling it during the
    // pooled wait is exactly the blanking the ruling removed.
    expect(mainSrc()).not.toMatch(/function stopHomeLiveness\(/);
  });

  it('the queue hooks drive the MODAL, never the status line (Eric 2026-08-18)', () => {
    const body = bodyOf(mainSrc(), 'async function startGame(');
    expect(body).toMatch(/onQueue: \(q\) => home\.setQueue\(q\)/);
    expect(body).toMatch(/onQueued: \(cancel\) => \{/);
    expect(body).toMatch(/home\.setCancel\(cancel\)/);
    // Entering the pool hands the status line BACK to the server register
    // rather than leaving CONNECTING… parked there for the whole two-minute
    // wait. Being pooled is not "connecting" — joining the queue is itself the
    // proof the socket is up — so the only thing this line may say is server
    // news. The queue's own numbers live in the modal.
    expect(body).toMatch(/if \(cancel\) handStatusBackToServer\(home\)/);
    // ...and a CANCEL likewise writes no queue copy onto it.
    expect(body).toMatch(/if \(cancelled\) handStatusBackToServer\(home\)/);
    expect(body).not.toMatch(/connectErrorStatus\(err\), cancelled \?/);
    // The retired reducers, and the status-hold machinery that existed ONLY to
    // arbitrate between them on the home's single register. Matched as CODE
    // rather than as text — main.ts's own RETIRED comment names all four, and a
    // bare source search would trip on the explanation of the deletion.
    const src = mainSrc();
    expect(src).not.toMatch(/^\s*(queueStatusLine|requeueStatusLine),$/m); // the import
    expect(src).not.toMatch(/function makeStatusHold\(/);
    expect(src).not.toMatch(/const REQUEUE_STATUS_HOLD_MS/);
    expect(src).not.toMatch(/hold\.(paint|cancel)\(/);
  });

  it('the door DEMOTES the poll rather than stopping it, and the arena stops it', () => {
    // Eric ruling 2026-08-18 ("keep the heartbeat running"): the register used to
    // blank for the whole pooled wait, which is the one moment a waiting player
    // most wants it. So the door keeps READING and stops BEACONING — the queue
    // socket counts that player from here, and beaconing too would count one
    // person twice. The poll ends with the home, not with the button press.
    const body = bodyOf(mainSrc(), 'async function startGame(');
    expect(body).toMatch(/startHomeLiveness\(home, false\)/);
    expect(body).not.toMatch(/stopHomeLiveness\(home\)/);
    // ...and the outright stop sits with home.hide(), where there is no longer a
    // register to feed. stopLivenessPoll, not stopHomeLiveness: painting a home
    // that hide() has already torn down is the one thing it exists to end.
    expect(body).toMatch(/home\.hide\(\);[\s\S]{0,600}?stopLivenessPoll\(\)/);
  });

  it('a poll RESTART does not blink the paint through "unavailable"', () => {
    // startHomeLiveness stops the previous poll only — the new one is about to
    // repaint the same surfaces, and a flash of nothing in between would be a
    // flicker with no meaning.
    const body = bodyOf(mainSrc(), 'function startHomeLiveness(');
    expect(body).toMatch(/stopLivenessPoll\(\)/);
    expect(body).not.toMatch(/setLiveness\(null\)/);
  });
});
