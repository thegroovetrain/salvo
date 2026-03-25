import { describe, it, expect } from 'vitest';
import { esc, playerIcon } from '../helpers/dom.js';
import { generateRandomName, formatTime } from '../helpers/format.js';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('returns empty string for empty input', () => {
    expect(esc('')).toBe('');
  });

  it('passes through plain text unchanged', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

describe('playerIcon', () => {
  it('returns bot icon SVG for bots', () => {
    const icon = playerIcon(true);
    expect(icon).toContain('player-icon');
    expect(icon).toContain('svg');
    expect(icon).toContain('rect'); // bot has rectangles
  });

  it('returns person icon SVG for humans', () => {
    const icon = playerIcon(false);
    expect(icon).toContain('player-icon');
    expect(icon).toContain('svg');
    expect(icon).toContain('circle'); // person has circle head
  });
});

describe('generateRandomName', () => {
  it('returns a string', () => {
    expect(typeof generateRandomName()).toBe('string');
  });

  it('contains a space (adjective + noun)', () => {
    expect(generateRandomName()).toContain(' ');
  });

  it('is at most 20 characters', () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 50; i++) {
      expect(generateRandomName().length).toBeLessThanOrEqual(20);
    }
  });

  it('generates different names (non-deterministic)', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateRandomName()));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('formatTime', () => {
  it('formats a timestamp as HH:MM', () => {
    // Create a known timestamp: Jan 1 2024 at 14:05
    const ts = new Date(2024, 0, 1, 14, 5).getTime();
    expect(formatTime(ts)).toBe('14:05');
  });

  it('pads single-digit hours and minutes', () => {
    const ts = new Date(2024, 0, 1, 3, 7).getTime();
    expect(formatTime(ts)).toBe('03:07');
  });
});
