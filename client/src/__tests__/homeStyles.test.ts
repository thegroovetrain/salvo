// The home's controls keep their inline styles (2026-11-25 review fix).
//
// jsdom voids a WHOLE `style.cssText` blob that carries a `border:` or
// `background:` shorthand with a `var()`; the callsign input and class chip did,
// so under test they had no layout at all. Longhands only.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { showHome } from '../ui/home.js';
import { forgetServedHome } from '../ui/homeStatic.js';

describe('home controls keep their styles', () => {
  afterEach(() => {
    document.getElementById('main-menu')?.remove();
    forgetServedHome();
  });

  it('the callsign input and the class chip carry their sizing and fill', () => {
    showHome('0.0.0-test', vi.fn());
    const input = document.querySelector('#main-menu input') as HTMLInputElement;
    const chip = document.querySelector('#main-menu [role="button"][title]:not([title="Settings"])') as HTMLElement;
    for (const el of [input, chip]) {
      expect(el.style.cssText).not.toBe('');
      expect(el.style.height).not.toBe('');
      expect(el.style.backgroundColor).not.toBe('');
    }
    expect(chip.style.display).toBe('flex');
  });
});
