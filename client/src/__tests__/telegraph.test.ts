// Engine-order telegraph (input/telegraph.ts): pure detent math, edge/repeat
// key handling, and the persistent stepped Telegraph setting.

import { describe, it, expect } from 'vitest';
import {
  DETENTS,
  NEUTRAL_INDEX,
  clampIndex,
  stepIndex,
  stepFromKey,
  Telegraph,
} from '../input/telegraph.js';

describe('DETENTS', () => {
  it('is the nine symmetric quarter-steps from -1 to +1, STOP in the middle', () => {
    expect([...DETENTS]).toEqual([-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
    expect(DETENTS).toHaveLength(9);
    expect(DETENTS[NEUTRAL_INDEX]).toBe(0);
  });
});

describe('clampIndex / stepIndex', () => {
  it('clamps an index into [0, 8]', () => {
    expect(clampIndex(-3)).toBe(0);
    expect(clampIndex(0)).toBe(0);
    expect(clampIndex(4)).toBe(4);
    expect(clampIndex(8)).toBe(8);
    expect(clampIndex(9)).toBe(8);
  });

  it('steps one detent up/down, clamped at the end stops', () => {
    expect(stepIndex(4, 1)).toBe(5);
    expect(stepIndex(4, -1)).toBe(3);
    expect(stepIndex(8, 1)).toBe(8); // full ahead — held
    expect(stepIndex(0, -1)).toBe(0); // full astern — held
  });
});

describe('stepFromKey — edge/repeat + arrow parity', () => {
  it('W / ArrowUp step ahead, S / ArrowDown step astern', () => {
    expect(stepFromKey('KeyW', false)).toBe(1);
    expect(stepFromKey('ArrowUp', false)).toBe(1);
    expect(stepFromKey('KeyS', false)).toBe(-1);
    expect(stepFromKey('ArrowDown', false)).toBe(-1);
  });

  it('ignores OS auto-repeat so one physical tap = one step', () => {
    expect(stepFromKey('KeyW', true)).toBeNull();
    expect(stepFromKey('ArrowDown', true)).toBeNull();
  });

  it('is null for rudder / unrelated keys', () => {
    expect(stepFromKey('KeyA', false)).toBeNull();
    expect(stepFromKey('KeyD', false)).toBeNull();
    expect(stepFromKey('Space', false)).toBeNull();
  });
});

describe('Telegraph — persistent stepped order', () => {
  it('starts at neutral (STOP / 0)', () => {
    const t = new Telegraph();
    expect(t.index).toBe(NEUTRAL_INDEX);
    expect(t.throttle).toBe(0);
  });

  it('ratchets up through every detent to full ahead, then holds at the stop', () => {
    const t = new Telegraph();
    const seen = [t.throttle];
    for (let i = 0; i < 6; i++) {
      t.step(1);
      seen.push(t.throttle);
    }
    expect(seen).toEqual([0, 0.25, 0.5, 0.75, 1, 1, 1]);
    expect(t.index).toBe(8);
  });

  it('ratchets down through every detent to full astern, then holds', () => {
    const t = new Telegraph();
    const seen = [t.throttle];
    for (let i = 0; i < 6; i++) {
      t.step(-1);
      seen.push(t.throttle);
    }
    expect(seen).toEqual([0, -0.25, -0.5, -0.75, -1, -1, -1]);
    expect(t.index).toBe(0);
  });

  it('step() reports whether the detent changed (false at an end stop — no click)', () => {
    const t = new Telegraph();
    for (let i = 0; i < 4; i++) expect(t.step(1)).toBe(true);
    expect(t.step(1)).toBe(false); // already full ahead
  });

  it('reset() returns to neutral from any order', () => {
    const t = new Telegraph();
    t.step(1);
    t.step(1);
    expect(t.throttle).toBe(0.5);
    t.reset();
    expect(t.index).toBe(NEUTRAL_INDEX);
    expect(t.throttle).toBe(0);
  });
});
