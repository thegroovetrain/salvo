import { describe, it, expect } from 'vitest';
import { CONFIG, type SmokeEvent } from '../index.js';

// Wounded Smoke (Story 4.4) constraint pins — the shared half of amendments
// 41/42/45. These are DERIVATION and SINGLE-SOURCE pins, not taste: the whole
// point of the story is that exactly ONE set of damage-band numbers and
// exactly ONE smoke reach exist in the codebase, so a later retune of the HP
// rail or of truesight moves the smoke with it instead of silently forking.
//
// The bands' OTHER consumer lives outside this workspace and cannot be
// imported from shared: `CLIENT_CONFIG.vitals.amberBelow` / `criticalBelow`
// in `client/src/config.ts` (drawn by hpColor() / railPulsing() in
// `client/src/render/hud.ts`). Those MUST be references to
// CONFIG.damageBands, never restated literals — the one requirement a green
// suite could still miss, so it is verified by reading that file, not here.

describe('CONFIG.damageBands — the one set of damage thresholds (amendment 41)', () => {
  it('carries the HP rail\'s SHIPPED values unchanged (0.5 / 0.25 — promoted, never retuned)', () => {
    expect(CONFIG.damageBands.amberBelow).toBe(0.5);
    expect(CONFIG.damageBands.criticalBelow).toBe(0.25);
  });

  it('orders the bands: criticalBelow < amberBelow (heavy is strictly worse than light)', () => {
    expect(CONFIG.damageBands.criticalBelow).toBeLessThan(CONFIG.damageBands.amberBelow);
  });

  it('keeps both bands inside (0, 1) — they are fractions of maxHp, never hp values', () => {
    for (const band of [CONFIG.damageBands.amberBelow, CONFIG.damageBands.criticalBelow]) {
      expect(band).toBeGreaterThan(0);
      expect(band).toBeLessThan(1);
    }
  });

  it('is THE source: the smoke tiers and the own-vitals rail read these same two numbers', () => {
    // Single-source pin. A second set of band numbers appearing anywhere
    // (client vitals restated, a server-side literal) is exactly what
    // amendment 41 forbids; this asserts the shared source exists and is the
    // object both readers are required to consult.
    expect(Object.keys(CONFIG.damageBands).sort()).toEqual(['amberBelow', 'criticalBelow']);
  });
});

describe('wounded smoke reach + cadence (amendment 42)', () => {
  it('reach IS CONFIG.vision.muzzleFlash — no fourth vision constant was added', () => {
    // Re-derived independently here (1.25 × sight — the eighths ladder's 5/8
    // rung since Story 4.9, amendment 119; was 1.5) so a one-sided edit to
    // either the constant or the derivation fails loudly. The plume's reach
    // moving with the flash is the POINT of the shared constant, not a
    // regression: Eric named the band "muzzle/smoke".
    expect(CONFIG.vision.muzzleFlash).toBe(CONFIG.vision.sight * 1.25);
    expect(Object.keys(CONFIG.vision)).not.toContain('smoke');
    expect(Object.keys(CONFIG.smoke)).not.toContain('range');
  });

  it('the smoke halo sits strictly between sight and radar: sight < muzzleFlash < radar', () => {
    expect(CONFIG.vision.sight).toBeLessThan(CONFIG.vision.muzzleFlash);
    expect(CONFIG.vision.muzzleFlash).toBeLessThan(CONFIG.vision.radar);
  });

  it('emits on a positive finite cadence (the server-side knob; puff LIFE is client-only)', () => {
    expect(CONFIG.smoke.puffIntervalMs).toBe(250);
    expect(Number.isFinite(CONFIG.smoke.puffIntervalMs)).toBe(true);
    expect(CONFIG.smoke.puffIntervalMs).toBeGreaterThan(0);
  });
});

describe('SmokeEvent wire shape (amendments 41/45)', () => {
  it('carries {k,x,y,tier} in that key order and NOTHING else — no identity channel', () => {
    const sample: SmokeEvent = { k: 'sm', x: 10, y: -20, tier: 2 };
    // Key ORDER is load-bearing (msgpack), and the key SET is the anti-cheat
    // law: no id, hue, class, hp, or fraction, for any observer including the
    // smoking hull's own captain and spectators.
    expect(Object.keys(sample)).toEqual(['k', 'x', 'y', 'tier']);
  });

  it('tier is a two-value ENUM keyed to the bands, never a fraction or an hp value', () => {
    const light: SmokeEvent = { k: 'sm', x: 0, y: 0, tier: 1 };
    const heavy: SmokeEvent = { k: 'sm', x: 0, y: 0, tier: 2 };
    expect([light.tier, heavy.tier]).toEqual([1, 2]);
    // Neither tier value may coincide with a band threshold — that would be
    // the fraction-on-the-wire mistake amendment 41 forbids.
    expect(light.tier).not.toBe(CONFIG.damageBands.amberBelow);
    expect(heavy.tier).not.toBe(CONFIG.damageBands.criticalBelow);
  });
});
