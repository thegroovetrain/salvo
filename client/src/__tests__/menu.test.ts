// Migrated from the retired ui/menu.ts: the callsign sanitize + name/class
// persistence pins now live against ui/home.ts (Story 1.14). The class pin
// splits into the nullable (first-run) + defaulting (in-game) pair; the stale
// class-picker caption assertions are dropped (the new chrome is exercised in
// home.test.ts / classSelect.test.ts).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sanitizeName,
  loadSavedName,
  loadSavedClass,
  loadSavedClassOrNull,
  isFirstRun,
  NAME_MAX,
} from '../ui/home.js';

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
