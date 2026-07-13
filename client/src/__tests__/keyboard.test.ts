import { describe, it, expect } from 'vitest';
import { axesFrom } from '../input/keyboard.js';

describe('axesFrom', () => {
  it('is zero with no keys', () => {
    expect(axesFrom(new Set())).toEqual({ throttle: 0, rudder: 0 });
  });

  it('W = full ahead, S = full astern', () => {
    expect(axesFrom(new Set(['KeyW']))).toEqual({ throttle: 1, rudder: 0 });
    expect(axesFrom(new Set(['KeyS']))).toEqual({ throttle: -1, rudder: 0 });
  });

  it('D = rudder right, A = rudder left', () => {
    expect(axesFrom(new Set(['KeyD']))).toEqual({ throttle: 0, rudder: 1 });
    expect(axesFrom(new Set(['KeyA']))).toEqual({ throttle: 0, rudder: -1 });
  });

  it('opposing keys cancel', () => {
    expect(axesFrom(new Set(['KeyW', 'KeyS']))).toEqual({ throttle: 0, rudder: 0 });
    expect(axesFrom(new Set(['KeyA', 'KeyD']))).toEqual({ throttle: 0, rudder: 0 });
  });

  it('combines throttle + rudder', () => {
    expect(axesFrom(new Set(['KeyW', 'KeyD']))).toEqual({ throttle: 1, rudder: 1 });
  });

  it('accepts arrow-key aliases', () => {
    expect(axesFrom(new Set(['ArrowUp', 'ArrowLeft']))).toEqual({ throttle: 1, rudder: -1 });
  });

  it('ignores unrelated keys', () => {
    expect(axesFrom(new Set(['Space', 'KeyQ']))).toEqual({ throttle: 0, rudder: 0 });
  });
});
