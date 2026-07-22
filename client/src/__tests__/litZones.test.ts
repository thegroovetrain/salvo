// Star-shell lit-zone render logic (render/litZones.ts) — the pure reconcile
// diff (mines precedent), the ownership tint, and the timestamp fade. The Pixi
// wiring (LitZones class) is a thin adapter around these; not unit tested.

import { describe, it, expect } from 'vitest';
import type { LitZoneView } from '@salvo/shared';
import { litZoneFade, litZoneTint, reconcileLitZones, LIT_FADE_MS } from '../render/litZones.js';

const zone = (id: string, by = 'enemy', until = 10_000): LitZoneView => ({
  id,
  x: 0,
  y: 0,
  r: 110,
  until,
  by,
});

const OWN_GREEN = 0x2f7d5a;
const ENEMY_AMBER = 0xffb800;

describe('reconcileLitZones — zone list → sprite lifecycle diff', () => {
  it('adds every zone when starting from nothing', () => {
    const { add, remove } = reconcileLitZones(new Set(), [zone('z1'), zone('z2', 'me')]);
    expect(add.map((z) => z.id)).toEqual(['z1', 'z2']);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose zone dropped out of the list (expired or out of radar)', () => {
    const { add, remove } = reconcileLitZones(new Set(['z1', 'z2']), [zone('z1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['z2']);
  });

  it('leaves zones present in both untouched (static center — nothing to update)', () => {
    const { add, remove } = reconcileLitZones(new Set(['z1']), [zone('z1'), zone('z3')]);
    expect(add.map((z) => z.id)).toEqual(['z3']);
    expect(remove).toEqual([]);
  });

  it('a missing frame key syncs as an empty list — clears everything', () => {
    // roomBindings passes `f.litZones ?? []`; an empty incoming means every held
    // zone is now gone (out of radar or expired) and its sprite must despawn.
    const { add, remove } = reconcileLitZones(new Set(['a', 'b']), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['a', 'b']);
  });
});

describe('litZoneTint — own-green vs enemy-amber by firer id', () => {
  it('tints the own ship’s own zone green and everyone else’s amber', () => {
    expect(litZoneTint('me', 'me')).toBe(OWN_GREEN);
    expect(litZoneTint('someoneElse', 'me')).toBe(ENEMY_AMBER);
  });

  it('with no own id (pre-session / spectator) every zone reads as enemy amber', () => {
    expect(litZoneTint('anyone', undefined)).toBe(ENEMY_AMBER);
  });
});

describe('litZoneFade — timestamp glow fade (until - serverNow)', () => {
  it('is full (1) while more than the fade window remains', () => {
    expect(litZoneFade(LIT_FADE_MS)).toBe(1); // exactly at the fade start
    expect(litZoneFade(LIT_FADE_MS + 5000)).toBe(1); // early in the zone life
  });

  it('ramps linearly to 0 across the last fade window', () => {
    expect(litZoneFade(LIT_FADE_MS / 2)).toBeCloseTo(0.5, 9);
    expect(litZoneFade(LIT_FADE_MS * 0.1)).toBeCloseTo(0.1, 9);
  });

  it('is 0 at and past expiry (no negative alpha)', () => {
    expect(litZoneFade(0)).toBe(0);
    expect(litZoneFade(-500)).toBe(0); // clock ran past `until`
  });

  it('honors a custom fade window', () => {
    expect(litZoneFade(500, 1000)).toBeCloseTo(0.5, 9);
    expect(litZoneFade(1000, 1000)).toBe(1);
  });
});
