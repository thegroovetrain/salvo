// Story 10.4 wave 2c — the secondaries heat square: the pure heat → look map,
// its seat in the weapon run (right after the gun), and its column swallowing a
// press without opening a tooltip.

import { describe, it, expect } from 'vitest';
import { SLOT_GUN } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { secHeatLook } from '../render/secHeat.js';
import { hudBarLayout } from '../render/hudBar.js';
import { hotbarPress, hoverTargetAt, secColumn, slotAtPoint } from '../render/hotbar.js';

const C = CLIENT_CONFIG.colors;
const B = CLIENT_CONFIG.hudBar;

describe('secHeatLook — heat is the fill, the lock is the denied skin', () => {
  it('reads cold with no state, and fills with the heat in the ready accent', () => {
    expect(secHeatLook(null)).toEqual({ state: 'readyWeapon', fill: 0, color: C.phosphor });
    let prev = -1;
    for (const heat of [0, 0.25, 0.5, 0.92, 1]) {
      const l = secHeatLook({ heat, locked: false });
      expect(l.state).toBe('readyWeapon');
      expect(l.color).toBe(C.phosphor);
      expect(l.fill).toBeCloseTo(heat, 9);
      expect(l.fill).toBeGreaterThan(prev);
      prev = l.fill;
    }
  });

  it('switches frame and fill to the denied color while locked, at any heat', () => {
    for (const heat of [1, 0.6, 0.01]) {
      const l = secHeatLook({ heat, locked: true });
      expect(l.state).toBe('denied');
      expect(l.color).toBe(C.denied);
      expect(l.fill).toBeCloseTo(heat, 9);
    }
  });

  it('clamps junk heat into the square', () => {
    expect(secHeatLook({ heat: 3, locked: false }).fill).toBe(1);
    expect(secHeatLook({ heat: -1, locked: false }).fill).toBe(0);
    expect(secHeatLook({ heat: Number.NaN, locked: false }).fill).toBe(0);
  });
});

describe('the heat square on the bar', () => {
  const L = hudBarLayout(1366, 768);

  it('sits in the seat right after the gun, at the weapon size and row', () => {
    const gun = L.squares[SLOT_GUN];
    expect(L.sec.x - gun.x).toBe(B.slot + B.slotGap);
    expect(L.sec.y).toBe(gun.y);
    expect(L.sec.w).toBe(gun.w);
    expect(L.squares[1].x - L.sec.x).toBe(B.slot + B.slotGap);
  });

  it('swallows a press on its column, opens no tooltip, and is no slot', () => {
    const col = secColumn(L);
    const p = { x: col.x + col.w / 2, y: col.y + col.h / 2 };
    expect(slotAtPoint(p, L)).toBeNull();
    expect(hoverTargetAt(p, L)).toBeNull();
    let fired = false;
    expect(hotbarPress(p, L, () => (fired = true))).toBe(true);
    expect(fired).toBe(false);
    expect(hotbarPress(p, null, () => {})).toBe(false);
  });
});
