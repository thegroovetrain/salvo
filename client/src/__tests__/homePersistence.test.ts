// home.ts persistence pins — the callsign sanitize + name/class load helpers
// (Story 1.14; migrated off the retired ui/menu.ts, which no longer exists —
// file renamed from menu.test.ts to match its subject). The class pin splits
// into the nullable (first-run) + defaulting (in-game) pair; the DOM chrome
// itself is exercised in home.test.ts / classSelect.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeName,
  loadSavedName,
  loadSavedClass,
  loadSavedClassOrNull,
  isFirstRun,
  NAME_MAX,
  SHIFT_KEY,
  loadSavedShift,
  saveShift,
} from '../ui/home.js';
import {
  DEFAULT_CLASS_ID,
  DEFAULT_SHIFT,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
} from '@salvo/shared';

/** A real hull that is NOT the default — so a stored pick is observable. */
const NON_DEFAULT_CLASS = SHIP_CLASS_IDS.find((c) => c !== DEFAULT_CLASS_ID)!;
/** Ids a pre-10.4 client could have stored (the retired hulls + older legacy). */
const LEGACY_CLASS_IDS = ['torpedoBoat', 'battleship', 'mineLayer', 'cruiser', 'carrier'];

describe('sanitizeName', () => {
  it('trims + caps at NAME_MAX', () => {
    expect(sanitizeName('  hi  ')).toBe('hi');
    expect(sanitizeName('X'.repeat(40))).toHaveLength(NAME_MAX);
  });
});

describe('loadSavedName', () => {
  beforeEach(() => localStorage.clear());

  it('returns the persisted callsign', () => {
    localStorage.setItem('hullcracker.name', 'AHAB');
    expect(loadSavedName()).toBe('AHAB');
  });

  it('re-slices a legacy stored name longer than NAME_MAX to the cap on load', () => {
    const legacy = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, NAME_MAX + 2);
    localStorage.setItem('hullcracker.name', legacy);
    expect(loadSavedName()).toBe(legacy.slice(0, NAME_MAX));
  });

  it('re-slices a stored legacy name of 8 astral emoji without a lone surrogate', () => {
    const emoji = '🚀'.repeat(8);
    localStorage.setItem('hullcracker.name', emoji);
    const out = loadSavedName();
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(loneSurrogate.test(out)).toBe(false);
    expect([...out]).toEqual([...emoji]);
  });
});

describe('loadSavedClass (defaulting variant — in-game consumers)', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to DEFAULT_CLASS_ID with nothing saved', () => {
    expect(loadSavedClass()).toBe(DEFAULT_CLASS_ID);
  });

  it('returns every valid saved class verbatim', () => {
    for (const cls of SHIP_CLASS_IDS) {
      localStorage.setItem('hullcracker.class', cls);
      expect(loadSavedClass()).toBe(cls);
    }
  });

  it('sanitizes a garbage / legacy stored value (incl. the pre-10.4 hulls) to DEFAULT_CLASS_ID', () => {
    for (const legacy of LEGACY_CLASS_IDS) {
      localStorage.setItem('hullcracker.class', legacy);
      expect(loadSavedClass(), legacy).toBe(DEFAULT_CLASS_ID);
    }
  });
});

describe('loadSavedClassOrNull (first-run signal — NO default pushed)', () => {
  beforeEach(() => localStorage.clear());

  it('is null when nothing is stored', () => {
    expect(loadSavedClassOrNull()).toBeNull();
    expect(isFirstRun()).toBe(true);
  });

  it('is the stored class for a returning player', () => {
    localStorage.setItem('hullcracker.class', NON_DEFAULT_CLASS);
    expect(loadSavedClassOrNull()).toBe(NON_DEFAULT_CLASS);
    expect(isFirstRun()).toBe(false);
  });

  it('a stored-but-legacy id is a RETURNING player (sanitized, never null)', () => {
    for (const legacy of LEGACY_CLASS_IDS) {
      localStorage.setItem('hullcracker.class', legacy);
      expect(loadSavedClassOrNull(), legacy).toBe(DEFAULT_CLASS_ID);
      expect(isFirstRun()).toBe(false);
    }
  });
});

// Story 10.4: the Shift is the seat's pick, stored under SHIFT_KEY beside the
// class. `sanitizeShiftId` fails open, so nothing stored or junk reads as the
// default and is simply preselected (no first-run signal).
describe('loadSavedShift / saveShift (Story 10.4)', () => {
  beforeEach(() => localStorage.clear());

  it('a fresh visit loads DEFAULT_SHIFT', () => {
    expect(loadSavedShift()).toBe(DEFAULT_SHIFT);
  });

  it('junk or a retired gun id loads DEFAULT_SHIFT', () => {
    for (const junk of ['', 'not-a-shift', 'deckGun', '42']) {
      localStorage.setItem(SHIFT_KEY, junk);
      expect(loadSavedShift(), junk).toBe(DEFAULT_SHIFT);
    }
  });

  it('every valid Shift round-trips through saveShift and SHIFT_KEY', () => {
    for (const id of SHIFT_IDS) {
      saveShift(id);
      expect(localStorage.getItem(SHIFT_KEY)).toBe(id);
      expect(loadSavedShift()).toBe(id);
    }
  });

  it('falls open to DEFAULT_SHIFT when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSavedShift()).toBe(DEFAULT_SHIFT);
    spy.mockRestore();
  });
});
