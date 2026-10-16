// The ONE alert color rule (render/alertBlend.ts, Story 9.11 — epic-9
// amendments 152–153, Eric's rulings (c) and (g) 2026-10-16): another's mine or
// zone breathes yellow↔orange on one shared integrated 1 Hz phase; a smooth
// blend, half the swing at reduced, steady orange at motion off. Pure — no Pixi.

import { describe, it, expect } from 'vitest';
import {
  ALERT_HZ,
  AlertClock,
  advanceAlertPhase,
  alertColor,
  alertMix,
  alertTint,
} from '../render/alertBlend.js';
import { CLIENT_CONFIG } from '../config.js';

const C = CLIENT_CONFIG.colors;
const TAU = Math.PI * 2;

describe('ALERT_HZ — a breathing channel under the photosensitivity ceiling', () => {
  it('never exceeds settings.pulseCapHz', () => {
    expect(ALERT_HZ).toBeLessThanOrEqual(CLIENT_CONFIG.settings.pulseCapHz);
    expect(ALERT_HZ).toBeGreaterThan(0);
  });
});

describe('advanceAlertPhase — integrated, clamped, wrapped', () => {
  it('a zero, negative or NaN frame gap advances nothing', () => {
    expect(advanceAlertPhase(0, 0)).toBe(0);
    expect(advanceAlertPhase(0, -1)).toBe(0);
    expect(advanceAlertPhase(1, Number.NaN)).toBe(1);
  });

  it('a backgrounded tab returning after a minute advances by the 0.5 s clamp', () => {
    expect(advanceAlertPhase(0, 60)).toBeCloseTo(advanceAlertPhase(0, 0.5), 12);
    expect(advanceAlertPhase(0, 0.5)).toBeCloseTo(ALERT_HZ * 0.5 * TAU, 12);
  });

  it('wraps below 2π', () => {
    let p = 0;
    for (let i = 0; i < 37; i++) {
      p = advanceAlertPhase(p, 0.5);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(TAU);
    }
  });
});

describe('alertMix — 0 is orange, the swing scales with motion', () => {
  const phases = Array.from({ length: 64 }, (_, i) => (i / 64) * TAU);

  it('motion off holds at 0 (steady orange) at every phase', () => {
    for (const p of phases) expect(alertMix(p, 'off')).toBe(0);
  });

  it('full motion sweeps the whole range, smoothly', () => {
    const mixes = phases.map((p) => alertMix(p, 'full'));
    expect(Math.min(...mixes)).toBeCloseTo(0, 6);
    expect(Math.max(...mixes)).toBeCloseTo(1, 6);
    // A smooth blend, never a hard switch: neighbouring phases stay close.
    for (let i = 1; i < mixes.length; i++) expect(Math.abs(mixes[i] - mixes[i - 1])).toBeLessThan(0.1);
  });

  it('reduced motion halves the swing (orange ↔ the midpoint)', () => {
    for (const p of phases) {
      expect(alertMix(p, 'reduced')).toBeCloseTo(alertMix(p, 'full') / 2, 12);
      expect(alertMix(p, 'reduced')).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('alertColor — an RGB lerp between the two tokens', () => {
  it('the endpoints ARE the tokens', () => {
    expect(alertColor(0)).toBe(C.alertOrange);
    expect(alertColor(1)).toBe(C.alertYellow);
  });

  it('clamps out-of-range and NaN input (NaN → orange)', () => {
    expect(alertColor(-3)).toBe(C.alertOrange);
    expect(alertColor(7)).toBe(C.alertYellow);
    expect(alertColor(Number.NaN)).toBe(C.alertOrange);
  });

  it('the midpoint sits between the tokens on every channel', () => {
    const mid = alertColor(0.5);
    for (const shift of [16, 8, 0]) {
      const ch = (c: number): number => (c >> shift) & 0xff;
      const lo = Math.min(ch(C.alertOrange), ch(C.alertYellow));
      const hi = Math.max(ch(C.alertOrange), ch(C.alertYellow));
      expect(ch(mid)).toBeGreaterThanOrEqual(lo);
      expect(ch(mid)).toBeLessThanOrEqual(hi);
    }
  });

  it('alertTint at motion off is orange whatever the phase', () => {
    for (const p of [0, 1, 2, 4, 6]) expect(alertTint(p, 'off')).toBe(C.alertOrange);
  });
});

describe('AlertClock — one phase on screen, advanced once per distinct nowSec', () => {
  it('the first call only anchors the clock', () => {
    const c = new AlertClock();
    c.advance(1234.5);
    expect(c.phase).toBe(0);
  });

  it('the same nowSec twice advances nothing — several readers in one frame move it once', () => {
    const c = new AlertClock();
    c.advance(10);
    c.advance(10.25);
    const once = c.phase;
    c.advance(10.25);
    c.advance(10.25);
    expect(c.phase).toBe(once);
    expect(once).toBeCloseTo(advanceAlertPhase(0, 0.25), 12);
  });

  it('a clock running backwards or a non-finite reading never advances it', () => {
    const c = new AlertClock();
    c.advance(10);
    c.advance(10.25);
    const p = c.phase;
    c.advance(9);
    expect(c.phase).toBe(p);
    c.advance(Number.NaN);
    expect(c.phase).toBe(p);
  });
});

describe('advanceAlertPhase — a corrupt phase input (Edge Case Hunter, 2026-10-16)', () => {
  it('a negative or NaN phase still lands in [0, 2π)', () => {
    const TAU = Math.PI * 2;
    for (const bad of [-1, -TAU * 3.5, Number.NaN]) {
      const p = advanceAlertPhase(bad, 0);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(TAU);
    }
  });
});
