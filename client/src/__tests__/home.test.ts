// Story 1.14 — home chrome: pure copy/status reducers plus DOM pins on
// showHome (first-run vs returning routing, chip + sub-line copy, hoist
// write/read, inert-note pattern, status-line states). DOM assertions follow
// the repo pattern (build, assert textContent / attributes).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  deploySubline,
  homeYieldStyle,
  serverStatusLine,
  showHome,
} from '../ui/home.js';
import { loadColorPref } from '../net/connection.js';

// --- pure reducers -----------------------------------------------------------

describe('deploySubline', () => {
  it('prompts a choice when no class is chosen', () => {
    expect(deploySubline(null)).toBe('SELECT A CLASS TO DEPLOY');
  });
  it('names the chosen class · SOLO (no mode selector — Epic 6)', () => {
    expect(deploySubline('torpedoBoat')).toBe('DEPLOY AS TORPEDO BOAT · SOLO');
    expect(deploySubline('battleship')).toBe('DEPLOY AS BATTLESHIP · SOLO');
    expect(deploySubline('mineLayer')).toBe('DEPLOY AS MINE LAYER · SOLO');
  });
});

describe('serverStatusLine — probe reducer', () => {
  it('probing / ready are quiet, unreachable is denied', () => {
    expect(serverStatusLine('probing')).toEqual({ text: 'SERVER: CHECKING…', tone: 'tertiary' });
    expect(serverStatusLine('ready')).toEqual({ text: 'SERVER: READY', tone: 'tertiary' });
    expect(serverStatusLine('unreachable')).toEqual({ text: 'SERVER: UNREACHABLE', tone: 'denied' });
  });
});

// --- DOM: showHome -----------------------------------------------------------

function home(): HTMLElement {
  return document.getElementById('main-menu') as HTMLElement;
}

function playButton(): HTMLButtonElement {
  return [...home().querySelectorAll('button')].find((b) => b.textContent?.includes('PLAY')) as HTMLButtonElement;
}

function nameInput(): HTMLInputElement {
  return home().querySelector('input') as HTMLInputElement;
}

function chip(): HTMLElement {
  return home().querySelector('[title="Open the class-select layer"]') as HTMLElement;
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

  it('first run: chip prompts SELECT CLASS, sub-line prompts, PLAY opens the layer (no deploy)', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    const text = home().textContent ?? '';
    expect(text).toContain('SELECT CLASS');
    expect(text).toContain('SELECT A CLASS TO DEPLOY');
    playButton().click();
    expect(onDeploy).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // layer opened
  });

  it('returning: chip shows the class + loadout, PLAY connects immediately', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    const text = home().textContent ?? '';
    expect(text).toContain('BATTLESHIP');
    expect(text).toContain('LONG-RANGE CANNON'); // chip loadout sub-line
    expect(text).toContain('DEPLOY AS BATTLESHIP · SOLO');
    playButton().click();
    expect(onDeploy).toHaveBeenCalledWith('', 'battleship'); // empty callsign → server assigns
    expect(document.getElementById('hc-class-select')).toBeNull(); // no layer, connected
  });

  it('first-run PLAY → layer → pick updates the chip + sub-line without deploying', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    playButton().click(); // opens the layer (TB pre-highlighted)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' })); // highlight battleship
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); // pick it
    expect(onDeploy).not.toHaveBeenCalled();
    const text = home().textContent ?? '';
    expect(text).toContain('BATTLESHIP');
    expect(text).toContain('DEPLOY AS BATTLESHIP · SOLO');
    expect(localStorage.getItem('hullcracker.class')).toBe('battleship'); // persisted
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

describe('showHome — Color Hoist writes hullcracker.color', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => home()?.remove());

  it('a swatch click persists the hue connect() reads', () => {
    showHome('0.0.0-test', vi.fn());
    const swatch = home().querySelector('button[aria-label="hue 9"]') as HTMLButtonElement; // idx 8 = cyan
    swatch.click();
    expect(localStorage.getItem('hullcracker.color')).toBe('8');
    expect(loadColorPref()).toBe(8);
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
});
