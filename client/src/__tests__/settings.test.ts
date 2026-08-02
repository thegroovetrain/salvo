// Story 2.3 — the settings store (schema/defaults/coercion/migration/subscribe),
// the derived accessibility helpers (motion, UI scale + its 1600px gate, the 9px
// mono floor, volume gain), the uniform ESC routing law, and the overlay's pure
// view model + its DOM shell (gear entry, live effect, danger confirm gating).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SettingsStore,
  coerceVolume,
  effectiveScale,
  loadSettings,
  monoFloorOk,
  motionAllowed,
  motionIntensity,
  motionScaled,
  sameSettings,
  sanitizeSettings,
  saveSettings,
  scaleFactor,
  scaleTierEnabled,
  scaleTierNote,
  volumeGain,
  type Settings,
} from '../settings/store.js';
import {
  ABANDON_BUTTON_ID,
  CLOSE_BUTTON_ID,
  RESET_BUTTON_ID,
  SettingsOverlay,
  bindingRows,
  canAbandon,
  canOpenSurface,
  dangerLabel,
  escapeAction,
  nextArmed,
  scaleOptions,
} from '../ui/settings.js';
import { CLIENT_CONFIG } from '../config.js';

const S = CLIENT_CONFIG.settings;

// --- schema / coercion / migration -------------------------------------------

describe('sanitizeSettings — every field falls back independently', () => {
  it('returns the ratified defaults for a missing / non-object payload', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(42)).toEqual(DEFAULT_SETTINGS);
    // The committed v1 defaults: full / 100% / off / 100 / 100 / off / off.
    expect(DEFAULT_SETTINGS).toEqual({
      motion: 'full',
      uiScale: 100,
      colorblind: false,
      masterVolume: 100,
      effectsVolume: 100,
      monoAudio: false,
      muted: false,
    });
  });

  it('keeps every valid field and repairs only the broken ones', () => {
    const s = sanitizeSettings({ motion: 'reduced', uiScale: 125, colorblind: true, masterVolume: 'loud', monoAudio: 1 });
    expect(s.motion).toBe('reduced');
    expect(s.uiScale).toBe(125);
    expect(s.colorblind).toBe(true);
    expect(s.masterVolume).toBe(100); // repaired, and the neighbours survived
    expect(s.monoAudio).toBe(false);
  });

  it('rejects unknown enum members and off-ramp scale tiers', () => {
    expect(sanitizeSettings({ motion: 'cinematic' }).motion).toBe('full');
    expect(sanitizeSettings({ uiScale: 150 }).uiScale).toBe(100); // no 150% tier — foreclosed
    expect(sanitizeSettings({ uiScale: 90 }).uiScale).toBe(90);
  });

  it('clamps + rounds volumes into 0..100', () => {
    expect(coerceVolume(-40, 100)).toBe(0);
    expect(coerceVolume(1e6, 100)).toBe(S.volumeMax);
    expect(coerceVolume(30.4, 100)).toBe(30);
    expect(coerceVolume(Number.NaN, 100)).toBe(100);
  });
});

describe('legacy hullcracker-muted migration (read-once fallback)', () => {
  beforeEach(() => localStorage.clear());

  it('starts MUTED from the legacy key when the new key is absent, and writes the new key', () => {
    localStorage.setItem(S.legacyMuteKey, '1');
    const loaded = loadSettings();
    expect(loaded.muted).toBe(true);
    saveSettings(loaded);
    expect(JSON.parse(localStorage.getItem(S.storeKey) ?? '{}').muted).toBe(true);
  });

  it('the NEW key is authoritative once present — a stale legacy flag is ignored', () => {
    localStorage.setItem(S.legacyMuteKey, '1');
    localStorage.setItem(S.storeKey, JSON.stringify({ ...DEFAULT_SETTINGS, muted: false }));
    expect(loadSettings().muted).toBe(false);
  });

  it('a corrupt payload falls back to defaults but STILL honors the legacy mute', () => {
    localStorage.setItem(S.legacyMuteKey, '1');
    localStorage.setItem(S.storeKey, '{not json');
    // A truncated write told us nothing, exactly like an absent key — so the
    // legacy flag still has a say. (Consulting it only on ABSENCE let one bad
    // write silently un-mute a player who had muted pre-2.3.)
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, muted: true });
  });

  it('WRITES the migrated value immediately, so the new key is authoritative from this boot', () => {
    localStorage.setItem(S.legacyMuteKey, '1');
    const loaded = loadSettings(); // no saveSettings() by the caller
    expect(loaded.muted).toBe(true);
    expect(JSON.parse(localStorage.getItem(S.storeKey) ?? 'null')).toEqual({ ...DEFAULT_SETTINGS, muted: true });
    // And a later legacy flip can never re-migrate: the new key now exists.
    localStorage.setItem(S.legacyMuteKey, '0');
    expect(loadSettings().muted).toBe(true);
  });
});

// --- derived accessibility helpers -------------------------------------------

describe('motion level → intensity', () => {
  it('full = 1, reduced HALVES, off = 0', () => {
    expect(motionIntensity('full')).toBe(1);
    expect(motionIntensity('reduced')).toBe(0.5);
    expect(motionIntensity('off')).toBe(0);
    expect(motionScaled(16, 'reduced')).toBe(8);
    expect(motionScaled(16, 'off')).toBe(0);
    expect(motionAllowed('off')).toBe(false);
    expect(motionAllowed('reduced')).toBe(true);
  });
});

describe('UI scale — tiers, the 1600px gate, and the mono floor', () => {
  it('90/100 are always selectable; 125 needs a 1600px-wide viewport', () => {
    expect(scaleTierEnabled(90, 1366)).toBe(true);
    expect(scaleTierEnabled(100, 1366)).toBe(true);
    expect(scaleTierEnabled(125, 1500)).toBe(false);
    expect(scaleTierEnabled(125, S.scaleGateWidthPx)).toBe(true);
  });

  it('a gated tier is SHOWN but disabled, with an explanatory note', () => {
    const opts = scaleOptions(1500);
    expect(opts.map((o) => o.value)).toEqual([...S.scaleTiers]);
    const gated = opts.find((o) => o.value === 125)!;
    expect(gated.enabled).toBe(false);
    expect(gated.note).toContain(String(S.scaleGateWidthPx));
    expect(opts.filter((o) => o.value !== 125).every((o) => o.enabled && o.note === '')).toBe(true);
  });

  it('a stored 125 falls back to 100 on a narrow viewport without rewriting the choice', () => {
    const stored: Settings = { ...DEFAULT_SETTINGS, uiScale: 125 };
    expect(effectiveScale(stored, 1366)).toBe(100);
    expect(effectiveScale(stored, 1920)).toBe(125);
    expect(stored.uiScale).toBe(125); // the preference itself is untouched
  });

  it('no mono type renders below the 9px floor at any selectable scale', () => {
    const smallestMono = CLIENT_CONFIG.type.registers.hudMicro.size; // the micro floor, 14px
    for (const tier of S.scaleTiers) expect(monoFloorOk(smallestMono, tier), `${tier}%`).toBe(true);
    expect(scaleFactor(90)).toBeCloseTo(0.9, 9);
    // ...and the floor really bites: the pre-lift 9px size would fail at 90%.
    expect(monoFloorOk(9, 90)).toBe(false);
  });
});

describe('volumeGain', () => {
  it('maps 0..100 onto a 0..1 linear bus gain, clamped', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(30)).toBeCloseTo(0.3, 9);
    expect(volumeGain(100)).toBe(1);
    expect(volumeGain(500)).toBe(1);
  });
});

// --- the live store ----------------------------------------------------------

describe('SettingsStore — live effect + persistence + reset', () => {
  beforeEach(() => localStorage.clear());

  it('notifies subscribers and persists on every real change', () => {
    const store = new SettingsStore({ ...DEFAULT_SETTINGS });
    const seen: Settings[] = [];
    store.subscribe((s) => seen.push(s));
    store.set({ masterVolume: 30 });
    expect(seen).toHaveLength(1);
    expect(store.current.masterVolume).toBe(30);
    // ...and it survives a reload.
    expect(new SettingsStore(loadSettings()).current.masterVolume).toBe(30);
  });

  it('a no-op write neither notifies nor churns', () => {
    const store = new SettingsStore({ ...DEFAULT_SETTINGS });
    const fn = vi.fn();
    store.subscribe(fn);
    store.set({ masterVolume: DEFAULT_SETTINGS.masterVolume });
    expect(fn).not.toHaveBeenCalled();
    expect(sameSettings(store.current, DEFAULT_SETTINGS)).toBe(true);
  });

  it('reset() restores the defaults and persists them', () => {
    const store = new SettingsStore({ ...DEFAULT_SETTINGS });
    store.set({ motion: 'off', uiScale: 90, colorblind: true, muted: true, effectsVolume: 12 });
    store.reset();
    expect(store.current).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('reset() leaves the callsign / class / color preference alone', () => {
    localStorage.setItem('hullcracker.name', 'SALTY DOG');
    localStorage.setItem('hullcracker.class', 'battleship');
    localStorage.setItem('hullcracker.color', '8');
    const store = new SettingsStore({ ...DEFAULT_SETTINGS });
    store.reset();
    expect(localStorage.getItem('hullcracker.name')).toBe('SALTY DOG');
    expect(localStorage.getItem('hullcracker.class')).toBe('battleship');
    expect(localStorage.getItem('hullcracker.color')).toBe('8');
  });

  it('unsubscribe stops the notifications', () => {
    const store = new SettingsStore({ ...DEFAULT_SETTINGS });
    const fn = vi.fn();
    store.subscribe(fn)();
    store.set({ muted: true });
    expect(fn).not.toHaveBeenCalled();
  });
});

// --- the uniform ESC law (amendment 23) --------------------------------------

describe('escapeAction — ESC closes the TOPMOST surface, never returns to port', () => {
  const none = { results: false, refit: false, settings: false };

  it('opens settings only when nothing is open', () => {
    expect(escapeAction(none)).toBe('openSettings');
  });

  it('closes the settings overlay when it is the only surface (toggle)', () => {
    expect(escapeAction({ ...none, settings: true })).toBe('closeSettings');
  });

  it('with the refit modal open, ESC closes the REFIT and settings does not open', () => {
    expect(escapeAction({ ...none, refit: true })).toBe('closeRefit');
  });

  it('the results modal outranks everything — ESC closes it (= SPECTATE)', () => {
    expect(escapeAction({ results: true, refit: true, settings: true })).toBe('closeResults');
    expect(escapeAction({ ...none, results: true })).toBe('closeResults');
  });
});

describe('canOpenSurface — nothing ever stacks, in either direction', () => {
  it('refuses to open settings over the refit modal or the results screen', () => {
    expect(canOpenSurface('settings', { results: false, refit: true, settings: false })).toBe(false);
    expect(canOpenSurface('settings', { results: true, refit: false, settings: false })).toBe(false);
  });

  it('refuses to open the refit modal over settings', () => {
    expect(canOpenSurface('refit', { results: false, refit: false, settings: true })).toBe(false);
  });

  it('allows an open when nothing else is up (and re-opening itself is fine)', () => {
    expect(canOpenSurface('settings', { results: false, refit: false, settings: false })).toBe(true);
    expect(canOpenSurface('settings', { results: false, refit: false, settings: true })).toBe(true);
  });
});

// --- the binding reference ---------------------------------------------------

describe('bindingRows — current truth (amendments 1–13), view-only', () => {
  const rows = bindingRows();
  const text = rows.map((r) => `${r.keys} ${r.action}`).join(' | ');

  it('lists the ratified v1 scheme', () => {
    expect(text).toContain('W / S');
    expect(text).toContain('A / D');
    expect(text).toContain('Q / E');
    expect(text).toContain('TAB');
    expect(text).toContain('ESC');
    expect(text).toContain('Z / X');
  });

  it('omits F — reserved for the Foghorn, not a binding', () => {
    expect(rows.some((r) => r.keys.trim() === 'F')).toBe(false);
  });

  it('never advertises the superseded SPACE-hold refit or a CTRL spend window', () => {
    expect(text).not.toContain('SPACE');
    expect(text).not.toContain('CTRL');
  });
});

// --- danger row --------------------------------------------------------------

describe('danger row — confirm-gated, no stacked modal', () => {
  it('a first press ARMS, a second on the same action FIRES', () => {
    const first = nextArmed(null, 'abandon');
    expect(first).toEqual({ armed: 'abandon', fire: false });
    expect(nextArmed(first.armed, 'abandon')).toEqual({ armed: null, fire: true });
  });

  it('pressing the OTHER danger action re-arms it instead of firing', () => {
    expect(nextArmed('abandon', 'reset')).toEqual({ armed: 'reset', fire: false });
  });

  it('the label carries the confirm prompt while armed', () => {
    expect(dangerLabel('abandon', null)).toBe('ABANDON MATCH');
    expect(dangerLabel('abandon', 'abandon')).toContain('CONFIRM');
    expect(dangerLabel('reset', 'abandon')).toBe('RESET SETTINGS');
  });
});

// --- the overlay's DOM shell -------------------------------------------------

describe('SettingsOverlay — DOM shell', () => {
  let overlay: SettingsOverlay;
  let store: SettingsStore;
  let inMatch: boolean;
  let abandons: number;
  let viewportW: number;
  let visibility: boolean[];

  beforeEach(() => {
    localStorage.clear();
    inMatch = false;
    abandons = 0;
    viewportW = 1920;
    visibility = [];
    store = new SettingsStore({ ...DEFAULT_SETTINGS });
    overlay = new SettingsOverlay({
      store,
      inMatch: () => inMatch,
      onAbandon: () => (abandons += 1),
      viewportWidth: () => viewportW,
      onVisibility: (v) => visibility.push(v),
    });
  });
  afterEach(() => overlay.destroy());

  function panelText(): string {
    return document.getElementById('hc-settings')?.textContent ?? '';
  }

  it('opens with every committed setting plus the binding reference', () => {
    overlay.open();
    expect(overlay.visible).toBe(true);
    const t = panelText();
    for (const section of ['MOTION', 'UI SCALE', 'COLORBLIND ASSIST', 'MASTER VOLUME', 'EFFECTS VOLUME', 'MONO AUDIO', 'MUTE']) {
      expect(t, section).toContain(section);
    }
    expect(t).toContain('ENGINE TELEGRAPH'); // the view-only bindings
  });

  it('toggle() closes an open overlay (the ESC toggle path)', () => {
    overlay.toggle();
    expect(overlay.visible).toBe(true);
    overlay.toggle();
    expect(overlay.visible).toBe(false);
  });

  it('a choice click writes through the store, live and persisted', () => {
    overlay.open();
    const off = [...document.querySelectorAll<HTMLButtonElement>('#hc-settings button')].find(
      (b) => b.dataset.value === 'off',
    );
    off?.click();
    expect(store.current.motion).toBe('off');
    expect(loadSettings().motion).toBe('off');
  });

  it('the overlay reflects an EXTERNAL mute write (the M key) while open', () => {
    overlay.open();
    store.set({ muted: true });
    const on = [...document.querySelectorAll<HTMLButtonElement>('#hc-settings button')].filter(
      (b) => b.dataset.value === 'true',
    );
    // The MUTE row's ON button is selected (amber) once the store says muted.
    expect(on.some((b) => b.style.color.includes('amber'))).toBe(true);
  });

  it('ABANDON MATCH renders only in a live match, and is confirm-gated', () => {
    overlay.open();
    expect(document.getElementById(ABANDON_BUTTON_ID)).toBeNull(); // at the home port
    overlay.close();
    inMatch = true;
    overlay.open();
    const btn = (): HTMLButtonElement => document.getElementById(ABANDON_BUTTON_ID) as HTMLButtonElement;
    btn().click();
    expect(abandons).toBe(0); // armed, not fired
    expect(btn().textContent).toContain('CONFIRM');
    btn().click();
    expect(abandons).toBe(1);
    expect(overlay.visible).toBe(false); // the overlay closes into the leave flow
  });

  it('RESET SETTINGS is confirm-gated and restores the defaults', () => {
    store.set({ motion: 'off', masterVolume: 10 });
    overlay.open();
    const btn = (): HTMLButtonElement => document.getElementById(RESET_BUTTON_ID) as HTMLButtonElement;
    btn().click();
    expect(store.current.motion).toBe('off'); // armed only
    btn().click();
    expect(store.current).toEqual(DEFAULT_SETTINGS);
  });

  it('changing a setting disarms a pending danger confirm', () => {
    inMatch = true;
    overlay.open();
    (document.getElementById(ABANDON_BUTTON_ID) as HTMLButtonElement).click();
    const off = [...document.querySelectorAll<HTMLButtonElement>('#hc-settings button')].find(
      (b) => b.dataset.value === 'off',
    );
    off?.click();
    expect((document.getElementById(ABANDON_BUTTON_ID) as HTMLButtonElement).textContent).not.toContain('CONFIRM');
    expect(abandons).toBe(0);
  });

  // --- REGRESSIONS (Story 2.3 review gate) ------------------------------------

  function sliders(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>('#hc-settings input[type=range]')];
  }

  it('a volume drag updates in place — the dragged input SURVIVES every input event', () => {
    overlay.open();
    const input = sliders()[0];
    expect(input).toBeDefined();
    // A full panel rebuild per input event destroyed the very element the
    // pointer was dragging, so a drag moved one step and then died.
    for (const v of ['70', '40', '15']) {
      input.value = v;
      input.dispatchEvent(new Event('input'));
      expect(sliders()[0], `after ${v}`).toBe(input); // same node, still in the DOM
      expect(document.body.contains(input)).toBe(true);
    }
    expect(store.current.masterVolume).toBe(15);
    expect(loadSettings().masterVolume).toBe(15); // persisted all the same
    // The readout tracked it without a rebuild.
    expect(document.getElementById('hc-settings')?.textContent).toContain('15');
  });

  it('the slider blurs on pointerup (mouse focus hygiene) but never mid-input', () => {
    overlay.open();
    const input = sliders()[0];
    input.focus();
    input.value = '50';
    input.dispatchEvent(new Event('input'));
    expect(document.activeElement).toBe(input); // keyboard arrows keep working
    input.dispatchEvent(new Event('pointerup'));
    expect(document.activeElement).not.toBe(input);
  });

  it('re-evaluates the 125% gate on a LIVE resize while open', () => {
    const tier125 = (): HTMLButtonElement | undefined =>
      [...document.querySelectorAll<HTMLButtonElement>('#hc-settings button')].find((b) => b.dataset.value === '125');
    overlay.open();
    expect(tier125()?.disabled).toBe(false); // 1920px: selectable
    viewportW = 1400;
    window.dispatchEvent(new Event('resize'));
    expect(tier125()?.disabled).toBe(true);
    expect(document.getElementById('hc-settings')?.textContent).toContain('1600px');
  });

  it('ENTER fires an ARMED danger action (amendment 19: second click OR Enter)', () => {
    inMatch = true;
    overlay.open();
    expect(overlay.confirmArmed()).toBe(false); // nothing armed: the key is not consumed
    (document.getElementById(ABANDON_BUTTON_ID) as HTMLButtonElement).click(); // arm
    expect(abandons).toBe(0);
    expect(overlay.confirmArmed()).toBe(true);
    expect(abandons).toBe(1);
  });

  it('ENTER confirms an armed RESET too, and disarms with it', () => {
    store.set({ motion: 'off' });
    overlay.open();
    (document.getElementById(RESET_BUTTON_ID) as HTMLButtonElement).click(); // arm
    expect(store.current.motion).toBe('off');
    expect(overlay.confirmArmed()).toBe(true);
    expect(store.current).toEqual(DEFAULT_SETTINGS);
    expect(overlay.confirmArmed()).toBe(false); // no longer armed
  });

  it('reports EVERY open/close so the home chrome can yield under it', () => {
    overlay.open();
    overlay.close();
    overlay.toggle();
    expect(visibility).toEqual([true, false, true]);
    // Including the panel's own CLOSE button — the path that left the home
    // permanently swallowing clicks when it was the only unreported close.
    (document.getElementById(CLOSE_BUTTON_ID) as HTMLButtonElement).click();
    expect(visibility).toEqual([true, false, true, false]);
  });
});

describe('canAbandon — where the leave button belongs (amendment 19)', () => {
  it('offers it while the match can still be abandoned', () => {
    for (const phase of ['waiting', 'gathering', 'countdown', 'active']) {
      expect(canAbandon(phase, false, false), phase).toBe(true);
    }
  });

  it('drops it once the match is FINISHED — RETURN TO PORT is the one way home', () => {
    expect(canAbandon('finished', false, false)).toBe(false);
    expect(canAbandon('active', true, false)).toBe(false); // matchOver latched client-side
  });

  it('drops it once a leave is already in flight', () => {
    expect(canAbandon('active', false, true)).toBe(false);
  });
});
