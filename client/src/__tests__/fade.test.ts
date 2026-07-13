// Contact sight-fade state machine (render/fade.ts): 150ms linear in/out,
// reversible mid-fade, destroy-safe only when fully hidden.

import { describe, it, expect } from 'vitest';
import { FADE_MS, Fader } from '../render/fade.js';

describe('Fader', () => {
  it('starts hidden (a new contact fades IN from 0)', () => {
    const f = new Fader(false);
    expect(f.alpha).toBe(0);
    expect(f.hidden).toBe(true);
  });

  it('show() ramps 0 → 1 linearly over FADE_MS', () => {
    const f = new Fader(false);
    f.show();
    expect(f.update(FADE_MS / 2)).toBeCloseTo(0.5, 12);
    expect(f.update(FADE_MS / 2)).toBe(1);
    expect(f.update(1000)).toBe(1); // saturates
  });

  it('hide() ramps 1 → 0 linearly over FADE_MS and only then reads hidden', () => {
    const f = new Fader(true);
    f.hide();
    expect(f.update(FADE_MS / 2)).toBeCloseTo(0.5, 12);
    expect(f.hidden).toBe(false); // mid-fade: keep rendering
    expect(f.update(FADE_MS / 2)).toBe(0);
    expect(f.hidden).toBe(true); // fully out: safe to destroy
  });

  it('a showing fader is never `hidden`, even at alpha 0', () => {
    const f = new Fader(false);
    f.show();
    expect(f.hidden).toBe(false);
  });

  it('reverses mid-fade without snapping (contact blinks back into sight)', () => {
    const f = new Fader(true);
    f.hide();
    f.update(FADE_MS * 0.6); // down to 0.4
    f.show();
    expect(f.update(FADE_MS * 0.3)).toBeCloseTo(0.7, 12); // back up from 0.4
    expect(f.update(FADE_MS)).toBe(1);
  });

  it('update is a no-op at the target', () => {
    const f = new Fader(true);
    expect(f.update(50)).toBe(1);
    expect(f.alpha).toBe(1);
  });
});
