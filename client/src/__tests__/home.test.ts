// Story 1.14 — home chrome: pure copy/status reducers plus DOM pins on
// showHome (first-run vs returning routing, chip + sub-line copy, hoist
// write/read, inert-note pattern, status-line states). DOM assertions follow
// the repo pattern (build, assert textContent / attributes).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  deploySubline,
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

describe('showHome — inert notes (no dead click, no modal)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => home()?.remove());

  it('gear click shows the quiet settings note', () => {
    showHome('0.0.0-test', vi.fn());
    (home().querySelector('[title="Settings"]') as HTMLElement).click();
    expect(home().textContent).toContain('SETTINGS ARRIVE IN A LATER REFIT');
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('HOW TO PLAY shows the field-manual note', () => {
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

  it('setBusy dims + un-dims the PLAY button', () => {
    const handle = showHome('0.0.0-test', vi.fn());
    handle.setBusy(true);
    expect(playButton().style.opacity).toBe('0.4');
    handle.setBusy(false);
    expect(playButton().style.opacity).toBe('1');
  });
});
