import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeName, loadSavedName, loadSavedClass, showMenu } from '../ui/menu.js';

describe('sanitizeName', () => {
  it('trims + caps at NAME_MAX', () => {
    expect(sanitizeName('  hi  ')).toBe('hi');
    expect(sanitizeName('X'.repeat(40))).toHaveLength(16);
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
});
