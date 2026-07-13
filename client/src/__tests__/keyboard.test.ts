import { describe, it, expect } from 'vitest';
import { WEAPON } from '@salvo/shared';
import { axesFrom, weaponFromKey } from '../input/keyboard.js';

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

describe('weaponFromKey', () => {
  it('maps 1/2/3 (top row + numpad) to gun/torpedo/mine', () => {
    expect(weaponFromKey('Digit1')).toBe(WEAPON.gun);
    expect(weaponFromKey('Digit2')).toBe(WEAPON.torpedo);
    expect(weaponFromKey('Digit3')).toBe(WEAPON.mine);
    expect(weaponFromKey('Numpad1')).toBe(WEAPON.gun);
    expect(weaponFromKey('Numpad2')).toBe(WEAPON.torpedo);
    expect(weaponFromKey('Numpad3')).toBe(WEAPON.mine);
  });

  it('returns null for non-weapon keys (so selection is left unchanged)', () => {
    expect(weaponFromKey('KeyW')).toBeNull();
    expect(weaponFromKey('Digit4')).toBeNull();
    expect(weaponFromKey('Space')).toBeNull();
  });
});
