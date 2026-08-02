// home.ts persistence pins — the callsign sanitize + name/class load helpers
// (Story 1.14; migrated off the retired ui/menu.ts, which no longer exists —
// file renamed from menu.test.ts to match its subject). The class pin splits
// into the nullable (first-run) + defaulting (in-game) pair; the DOM chrome
// itself is exercised in home.test.ts / classSelect.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeName,
  loadSavedName,
  loadSavedClass,
  loadSavedClassOrNull,
  isFirstRun,
  NAME_MAX,
  showHome,
} from '../ui/home.js';
import { loadColorPref, __resetSessionColorPrefForTests } from '../net/connection.js';

// The connection module caches the session's rolled hue (review-gate fix for
// blocked-storage divergence); reset it per test so corrupt/absent-pref cases
// exercise a fresh roll instead of the previous test's cached one.
beforeEach(() => __resetSessionColorPrefForTests());
import { PLAYER_HUES } from '../render/ships.js';

describe('sanitizeName', () => {
  it('trims + caps at NAME_MAX (14 — matches the kill feed)', () => {
    expect(sanitizeName('  hi  ')).toBe('hi');
    expect(NAME_MAX).toBe(14);
    expect(sanitizeName('X'.repeat(40))).toHaveLength(14);
  });
});

describe('loadSavedName', () => {
  beforeEach(() => localStorage.clear());

  it('returns the persisted callsign', () => {
    localStorage.setItem('hullcracker.name', 'AHAB');
    expect(loadSavedName()).toBe('AHAB');
  });

  it('re-slices a legacy stored 16-char name to the tightened 14 cap on load', () => {
    localStorage.setItem('hullcracker.name', 'ABCDEFGHIJKLMNOP'); // 16 chars
    expect(loadSavedName()).toBe('ABCDEFGHIJKLMN'); // sliced to 14
    expect(loadSavedName()).toHaveLength(14);
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

  it('defaults to torpedoBoat with nothing saved', () => {
    expect(loadSavedClass()).toBe('torpedoBoat');
  });

  it('returns a valid saved class', () => {
    localStorage.setItem('hullcracker.class', 'mineLayer');
    expect(loadSavedClass()).toBe('mineLayer');
  });

  it('sanitizes a garbage / legacy stored value to torpedoBoat', () => {
    localStorage.setItem('hullcracker.class', 'carrier');
    expect(loadSavedClass()).toBe('torpedoBoat');
    localStorage.setItem('hullcracker.class', 'cruiser');
    expect(loadSavedClass()).toBe('torpedoBoat');
  });
});

describe('loadSavedClassOrNull (first-run signal — NO default pushed)', () => {
  beforeEach(() => localStorage.clear());

  it('is null when nothing is stored', () => {
    expect(loadSavedClassOrNull()).toBeNull();
    expect(isFirstRun()).toBe(true);
  });

  it('is the stored class for a returning player', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    expect(loadSavedClassOrNull()).toBe('battleship');
    expect(isFirstRun()).toBe(false);
  });

  it('a stored-but-legacy id is a RETURNING player (sanitized, never null)', () => {
    localStorage.setItem('hullcracker.class', 'cruiser');
    expect(loadSavedClassOrNull()).toBe('torpedoBoat');
    expect(isFirstRun()).toBe(false);
  });
});

// The personal-color preference is the third persisted home value (alongside
// name + class). Mounting the home ENSURES it: an absent/corrupt key is rerolled
// and written before first paint, a valid one is kept verbatim (never rerolled).
describe('hullcracker.color — ensured at home mount', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => document.getElementById('main-menu')?.remove());

  it('first visit: a valid random index is persisted by the time home is up', () => {
    expect(localStorage.getItem('hullcracker.color')).toBeNull();
    showHome('0.0.0-test', vi.fn());
    const raw = localStorage.getItem('hullcracker.color');
    expect(raw).not.toBeNull();
    const idx = Number(raw);
    expect(Number.isInteger(idx)).toBe(true);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(PLAYER_HUES.length);
    expect(loadColorPref()).toBe(idx);
  });

  it('a valid stored preference survives a mount untouched (no reroll)', () => {
    localStorage.setItem('hullcracker.color', '13');
    showHome('0.0.0-test', vi.fn());
    expect(localStorage.getItem('hullcracker.color')).toBe('13');
  });

  it('a corrupt stored preference is replaced with a valid index', () => {
    localStorage.setItem('hullcracker.color', '99');
    showHome('0.0.0-test', vi.fn());
    expect(loadColorPref()).not.toBeUndefined();
    expect(Number(localStorage.getItem('hullcracker.color'))).toBeLessThan(PLAYER_HUES.length);
  });
});
