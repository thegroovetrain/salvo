// Story 1.14 — home chrome: pure copy/status reducers plus DOM pins on
// showHome (first-run vs returning routing, chip copy, personal-color tint,
// inert-note pattern, status-line states). DOM assertions follow the repo
// pattern (build, assert textContent / attributes).
//
// Home-page maintenance patch re-takes pins DELIBERATELY: the home carries NO
// color picker (the class bay footer owns it), the chip carries NO loadout
// sub-line, and the callsign field + chip are TINTED with the ensured personal
// hue (which a pick in the bay repaints live).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  homeYieldStyle,
  livenessLines,
  loadSavedMode,
  queueButtonSubline,
  queueStatusLine,
  requeueStatusLine,
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

describe('queueStatusLine — Story 6.1 queue liveness copy', () => {
  it('says plainly that it is waiting when the pool is UNARMED (no phantom countdown)', () => {
    // startsInMs is null below `min`: there is no deadline, so a countdown here
    // would be a number that cannot fire.
    expect(queueStatusLine({ n: 1, min: 2, cap: 20, startsInMs: null })).toEqual({
      text: 'QUEUED 1/2 · AWAITING A SECOND CAPTAIN',
      tone: 'info',
    });
  });

  it('counts down the armed deadline in m:ss', () => {
    expect(queueStatusLine({ n: 2, min: 2, cap: 20, startsInMs: 120_000 }).text).toBe(
      'QUEUED 2 CAPTAINS · DEPLOY IN 2:00',
    );
    expect(queueStatusLine({ n: 7, min: 2, cap: 20, startsInMs: 65_000 }).text).toBe(
      'QUEUED 7 CAPTAINS · DEPLOY IN 1:05',
    );
  });

  it('CEILS the countdown — never 0:00 while time remains (chrome-bar grammar)', () => {
    expect(queueStatusLine({ n: 2, min: 2, cap: 20, startsInMs: 1 }).text).toContain('0:01');
    expect(queueStatusLine({ n: 2, min: 2, cap: 20, startsInMs: 0 }).text).toContain('0:00');
    // A negative/overshot deadline clamps rather than printing a negative clock.
    expect(queueStatusLine({ n: 2, min: 2, cap: 20, startsInMs: -500 }).text).toContain('0:00');
  });

  it('FAILS SAFE to the waiting line when a server omits startsInMs entirely', () => {
    const bogus = { n: 1, min: 2, cap: 20 } as unknown as Parameters<typeof queueStatusLine>[0];
    expect(queueStatusLine(bogus).text).toContain('AWAITING A SECOND CAPTAIN');
    expect(queueStatusLine(bogus).text).not.toContain('NaN');
  });

  it('carries NO mode selector and NO liveness panel copy (both are Story 6.6)', () => {
    const armed = queueStatusLine({ n: 4, min: 2, cap: 20, startsInMs: 30_000 }).text;
    expect(armed).not.toMatch(/SOLO|MODE|VS AI/);
  });
});

describe('requeueStatusLine — Story 6.3 collapse copy', () => {
  it('is the queue register grammar: uppercase, one line, info tone', () => {
    const line = requeueStatusLine();
    expect(line.tone).toBe('info'); // a wait, not a failure — never `denied`
    expect(line.text).toBe(line.text.toUpperCase());
    expect(line.text).not.toContain('\n');
  });

  it('says what happened AND that a search is already under way', () => {
    const { text } = requeueStatusLine();
    expect(text).toMatch(/DISBANDED/);
    expect(text).toMatch(/SEARCHING/);
  });

  // The honesty clause (R7): nobody did anything wrong, so the line must not
  // read as a fault, an error, or an accusation aimed at the captain who left.
  it('blames nobody and reports no error', () => {
    const { text } = requeueStatusLine();
    expect(text).not.toMatch(/ERROR|FAIL|SORRY|LOST CONNECTION|DISCONNECT|ABANDON|QUIT|LEFT/);
  });
});

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
    expect(playButton().style.height).toBe(soloButton().style.height);
    expect(playButton().style.width).toBe(soloButton().style.width);
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

describe('showHome — the queue CANCEL affordance (Story 6.1)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => home()?.remove());

  function cancelEl(): HTMLElement {
    return home().querySelector('[title="Leave the queue"]') as HTMLElement;
  }

  it('is hidden until setCancel hands it a canceller, and hidden again after', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    expect(cancelEl().style.display).toBe('none');
    handle.setCancel(vi.fn());
    expect(cancelEl().style.display).toBe('inline');
    handle.setCancel(null);
    expect(cancelEl().style.display).toBe('none');
  });

  it('runs the canceller on click and on Enter — no reload path involved', () => {
    const cancel = vi.fn();
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setCancel(cancel);
    cancelEl().click();
    expect(cancel).toHaveBeenCalledTimes(1);
    cancelEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('a withdrawn canceller cannot be fired by a stale click', () => {
    const cancel = vi.fn();
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setCancel(cancel);
    handle.setCancel(null);
    cancelEl().click();
    expect(cancel).not.toHaveBeenCalled();
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

describe("queueButtonSubline — the SOLO door's live sub-line", () => {
  const NOW = 1_000_000;

  it('names what is MISSING while unarmed — never a countdown that cannot fire', () => {
    expect(queueButtonSubline({ pooled: 1, min: 2, cap: 20, deadlineAt: null }, NOW)).toBe(
      '1 QUEUED · NEEDS 2 TO START',
    );
  });

  it('reads the threshold from `min`, so a server-side retune cannot make it lie', () => {
    expect(queueButtonSubline({ pooled: 2, min: 5, cap: 20, deadlineAt: null }, NOW)).toBe(
      '2 QUEUED · NEEDS 5 TO START',
    );
  });

  it('counts the ABSOLUTE deadline down in m:ss once armed', () => {
    expect(queueButtonSubline({ pooled: 4, min: 2, cap: 20, deadlineAt: NOW + 83_000 }, NOW)).toBe(
      '4 QUEUED · STARTS 1:23',
    );
  });

  it('ticks LOCALLY between polls — the same payload, a later clock', () => {
    const q = { pooled: 4, min: 2, cap: 20, deadlineAt: NOW + 83_000 };
    expect(queueButtonSubline(q, NOW + 3000)).toBe('4 QUEUED · STARTS 1:20');
    expect(queueButtonSubline(q, NOW + 60_000)).toBe('4 QUEUED · STARTS 0:23');
  });

  it('clamps a passed deadline at 0:00 — never negative', () => {
    const q = { pooled: 4, min: 2, cap: 20, deadlineAt: NOW - 30_000 };
    expect(queueButtonSubline(q, NOW)).toBe('4 QUEUED · STARTS 0:00');
    expect(queueButtonSubline(q, NOW)).not.toContain('-');
  });

  it('treats NO QUEUE ROOM as an empty pool — the normal empty state, not an error', () => {
    // The room autoDisposes when the last captain leaves, so "nobody queued"
    // and "no room" are the same fact and must read identically.
    expect(queueButtonSubline(null, NOW)).toBe('0 QUEUED · NEEDS 2 TO START');
  });
});

describe('showHome — the liveness surfaces (Story 6.6)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  /** The top-left block — the settings gear's mirror. */
  function livenessBlock(): HTMLElement {
    return [...home().children].find(
      (el) => (el as HTMLElement).style.left === '26px',
    ) as HTMLElement;
  }

  it('is TOP-LEFT, the mirror of the gear at top-right, and out of the port column', () => {
    showHome('0.0.0-test', vi.fn());
    const block = livenessBlock();
    const gear = [...home().children].find((el) => el.textContent === '⚙') as HTMLElement;
    expect(block.style.position).toBe('absolute'); // costs the rigid column zero height
    expect(block.style.top).toBe(gear.style.top); // same inset as its mirror
    expect(block.style.left).toBe('26px');
    expect(gear.style.right).toBe('26px');
  });

  it('does not render at all until a payload arrives, and hides again on an outage', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    expect(livenessBlock().style.display).toBe('none');
    expect(sublineOf(playButton()).style.display).toBe('none');
    handle.setLiveness(livePayload());
    expect(livenessBlock().style.display).toBe('flex');
    handle.setLiveness(null);
    expect(livenessBlock().style.display).toBe('none');
    expect(sublineOf(playButton()).style.display).toBe('none');
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
    handle.setLiveness(livePayload({ playersOnline: 0, liveGames: 0, queue: null }));
    expect(livenessBlock().style.display).toBe('flex');
    expect(livenessBlock().textContent).toContain('PLAYERS ONLINE: 0');
    expect(sublineOf(playButton()).textContent).toBe('0 QUEUED · NEEDS 2 TO START');
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

  it('the SOLO sub-line ticks locally ~1Hz off the absolute deadline while ARMED', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(livePayload({ queue: { pooled: 4, min: 2, cap: 20, deadlineAt: 1_083_000 } }));
    expect(sublineOf(playButton()).textContent).toBe('4 QUEUED · STARTS 1:23');
    vi.advanceTimersByTime(3000); // no new payload — the clock alone moves it
    expect(sublineOf(playButton()).textContent).toBe('4 QUEUED · STARTS 1:20');
    handle.hide();
    vi.useRealTimers();
  });

  it('runs NO timer while unarmed (an idle port must not repaint once a second)', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(livePayload({ queue: { pooled: 1, min: 2, cap: 20, deadlineAt: null } }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    handle.hide();
  });

  it('hide() stops the tick — it must never repaint a detached home', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setLiveness(livePayload({ queue: { pooled: 4, min: 2, cap: 20, deadlineAt: 1_083_000 } }));
    const sub = sublineOf(playButton());
    handle.hide();
    const before = sub.textContent;
    vi.advanceTimersByTime(30_000);
    expect(sub.textContent).toBe(before);
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
