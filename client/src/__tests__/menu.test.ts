import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeName, loadSavedName, loadSavedClass } from '../ui/menu.js';

describe('sanitizeName', () => {
  it('trims + caps at NAME_MAX', () => {
    expect(sanitizeName('  hi  ')).toBe('hi');
    expect(sanitizeName('X'.repeat(40))).toHaveLength(16);
  });
});

describe('loadSavedClass', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to cruiser with nothing saved', () => {
    expect(loadSavedClass()).toBe('cruiser');
  });

  it('returns a valid saved class', () => {
    localStorage.setItem('hullcracker.class', 'destroyer');
    expect(loadSavedClass()).toBe('destroyer');
  });

  it('sanitizes a garbage saved value to cruiser', () => {
    localStorage.setItem('hullcracker.class', 'carrier');
    expect(loadSavedClass()).toBe('cruiser');
  });
});

describe('loadSavedName', () => {
  beforeEach(() => localStorage.clear());

  it('returns the persisted callsign', () => {
    localStorage.setItem('hullcracker.name', 'AHAB');
    expect(loadSavedName()).toBe('AHAB');
  });
});
