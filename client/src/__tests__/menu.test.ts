import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeName, loadSavedName, loadSavedClass, showMenu, NAME_MAX } from '../ui/menu.js';

describe('sanitizeName', () => {
  it('trims + caps at NAME_MAX (14 — Eric ruling 2026-07-23, matches the kill feed)', () => {
    expect(sanitizeName('  hi  ')).toBe('hi');
    expect(NAME_MAX).toBe(14);
    expect(sanitizeName('X'.repeat(40))).toHaveLength(14);
  });
});

describe('loadSavedClass', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to torpedoBoat with nothing saved', () => {
    expect(loadSavedClass()).toBe('torpedoBoat');
  });

  it('returns a valid saved class', () => {
    localStorage.setItem('hullcracker.class', 'mineLayer');
    expect(loadSavedClass()).toBe('mineLayer');
  });

  it('sanitizes a garbage saved value to torpedoBoat', () => {
    localStorage.setItem('hullcracker.class', 'carrier');
    expect(loadSavedClass()).toBe('torpedoBoat');
  });

  it('sanitizes a legacy stored id (cruiser) to torpedoBoat', () => {
    localStorage.setItem('hullcracker.class', 'cruiser');
    expect(loadSavedClass()).toBe('torpedoBoat');
  });
});

describe('class picker labels + captions (pins the ratified three)', () => {
  afterEach(() => {
    document.getElementById('main-menu')?.remove();
    localStorage.clear();
  });

  it('renders TORPEDO BOAT / BATTLESHIP / MINE LAYER with their captions', () => {
    const handle = showMenu('0.0.0-test', () => {});
    const text = document.getElementById('main-menu')?.textContent ?? '';
    for (const label of ['TORPEDO BOAT', 'BATTLESHIP', 'MINE LAYER']) {
      expect(text).toContain(label);
    }
    for (const caption of ['FAST · FRAGILE', 'SLOW · ARMORED', 'AREA DENIAL']) {
      expect(text).toContain(caption);
    }
    handle.hide();
  });
});

describe('loadSavedName', () => {
  beforeEach(() => localStorage.clear());

  it('returns the persisted callsign', () => {
    localStorage.setItem('hullcracker.name', 'AHAB');
    expect(loadSavedName()).toBe('AHAB');
  });

  it('re-slices a legacy stored 16-char name to the tightened 14 cap on load', () => {
    // A name saved before the 14-cap (up to the old maxLength 16) must be
    // re-sliced when loaded — sanitizeName runs on the stored value.
    localStorage.setItem('hullcracker.name', 'ABCDEFGHIJKLMNOP'); // 16 chars
    expect(loadSavedName()).toBe('ABCDEFGHIJKLMN'); // sliced to 14
    expect(loadSavedName()).toHaveLength(14);
  });

  it('re-slices a stored legacy name of 8 astral emoji without a lone surrogate', () => {
    // 8 astral emoji = 8 code points but 16 UTF-16 units. A UTF-16 slice(0,14)
    // would cut mid-pair and leave a lone surrogate; sanitizeName slices on CODE
    // POINTS, so an 8-cp name (≤ 14) round-trips every code point intact.
    const emoji = '🚀'.repeat(8);
    localStorage.setItem('hullcracker.name', emoji);
    const out = loadSavedName();
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(loneSurrogate.test(out)).toBe(false);
    expect([...out]).toEqual([...emoji]); // every code point survives
  });
});
