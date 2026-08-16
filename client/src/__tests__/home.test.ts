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
  deploySubline,
  homeYieldStyle,
  queueStatusLine,
  requeueStatusLine,
  serverStatusLine,
  showHome,
} from '../ui/home.js';
import { loadColorPref, __resetSessionColorPrefForTests } from '../net/connection.js';
import { HOME_TAGLINES } from '../ui/taglines.js';

// The connection module caches the session's rolled hue (review-gate fix for
// blocked-storage divergence); reset it per test so corrupt/absent-pref cases
// exercise a fresh roll instead of the previous test's cached one.
beforeEach(() => __resetSessionColorPrefForTests());
import { PLAYER_HUES } from '../render/ships.js';
import { cssHex } from '../util/color.js';

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

function playButton(): HTMLButtonElement {
  return [...home().querySelectorAll('button')].find((b) => b.textContent?.includes('PLAY')) as HTMLButtonElement;
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

  it('first run: chip prompts SELECT CLASS, sub-line prompts, PLAY opens the layer (no deploy)', () => {
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    const text = home().textContent ?? '';
    expect(text).toContain('SELECT CLASS');
    expect(text).toContain('SELECT A CLASS TO DEPLOY');
    expect(text).not.toContain('CLICK TO OPEN THE CLASS BAY'); // slimmed away with the sub-line
    playButton().click();
    expect(onDeploy).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).not.toBeNull(); // layer opened
  });

  // RE-TAKEN pin (was "chip shows the class + loadout"): the chip is SLIM now —
  // silhouette, role tag, class name, CHANGE CLASS. No loadout sub-line.
  it('returning: chip shows the class with NO loadout sub-line, PLAY connects immediately', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const onDeploy = vi.fn();
    showHome('0.0.0-test', onDeploy);
    const text = home().textContent ?? '';
    expect(text).toContain('BATTLESHIP');
    expect(text).toContain('YOUR SHIP');
    expect(text).toContain('CHANGE CLASS');
    expect(text).not.toContain('STD GUN'); // the retired loadout sub-line
    expect(text).not.toContain('LONG-RANGE CANNON');
    expect(text).toContain('DEPLOY AS BATTLESHIP · SOLO');
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

  // The PLAY button's amber chrome lives in a `border:1px solid var(--hc-amber)`
  // blob that jsdom's cssstyle voids wholesale (the documented CSSOM-blob
  // hazard), so it can't be read back. What IS pinnable: the accent repaint
  // never writes a personal hue onto it, while the chip/callsign both get one.
  it('PLAY is never personal-tinted — the amber action register stays amber', () => {
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
    playButton().click(); // first-run PLAY opens the bay (TB pre-highlighted)
    press('3'); // highlight mineLayer
    confirmButton().click();
    expect(localStorage.getItem('hullcracker.class')).toBe('mineLayer');
    expect(onDeploy).not.toHaveBeenCalled(); // PLAY is the ONLY deploy path
    expect(document.getElementById('hc-class-select')).toBeNull();
    expect(home().textContent).toContain('MINE LAYER');
    expect(home().textContent).toContain('DEPLOY AS MINE LAYER · SOLO');
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
