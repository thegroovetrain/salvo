// ALERTS ON THE WATER (Story 9.11, Eric 2026-10-14/16, epic-9 amendments
// 152–153) — the ONE color rule every warning on the water now wears. Your own
// mines and your own zones are WHITE; anybody else's — an enemy mine you have
// spotted, another captain's lit / burn / foul zone ring — breathes between
// yellow and orange like a hazard light: "WARNING, MINE!". The firer's personal
// hue (Story 1.12) left the mine and zone family for good.
//
// A BREATHING CHANNEL, NOT A FLASH. The blend runs at `ALERT_HZ` = 1 Hz (the
// chromeBar RING_PULSE_HZ precedent), capped by `settings.pulseCapHz`, and is a
// SMOOTH sine mix — never an on/off switch (Eric 2026-10-16: "a smooth blend").
// It is EXEMPT from render/flashBudget.ts by construction, and that file says
// why in its own header: "BREATHING CHANNELS ARE EXEMPT BY CONSTRUCTION — DO NOT
// 'FIX' THIS OMISSION. Every pulsing surface in the game is capped at
// `settings.pulseCapHz` (1.1 Hz) or below … THE BUDGET GOVERNS ONE-SHOTS." So
// nothing here is ever routed through the budget.
//
// MOTION SCALES THE SWING, NEVER THE WARNING. `motion: 'off'` stops the blend
// and the thing sits at steady ORANGE (Eric 2026-10-16: "Okay, that's fine");
// `reduced` halves the swing (orange ↔ the midpoint). The alert's presence,
// position and kind are information and never motion-gated (epic-4
// amendment 49) — only the color moves.
//
// ONE PHASE ON SCREEN. The phase is INTEGRATED per frame (never derived from
// absolute time — the hud.ts advancePulsePhase reasoning, the burnZones ember
// shape this replaces: an integrated phase is continuous through any rate
// change), and it lives on ONE module-level clock, `alertClock`, so an enemy
// mine and a zone ring in the same frame breathe in step. The per-frame caller
// advances it ONCE (main.ts calls `Mines.render` first); every other reader
// advancing it again with the same `nowSec` is a no-op.
//
// Pure: no Pixi import. Geometry is drawn once in white; the renderers apply
// `alertTint` as a multiplicative `tint`, so white × tint = the alert color.

import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, type MotionLevel } from '../settings/store.js';

const TAU = Math.PI * 2;
const C = CLIENT_CONFIG.colors;

/** The alert blend's rate (Hz) — 1 Hz, never above the photosensitivity
 *  ceiling (the chromeBar `RING_PULSE_HZ` precedent). */
export const ALERT_HZ = Math.min(1, CLIENT_CONFIG.settings.pulseCapHz);

/** Largest frame gap (s) the phase integrator advances across (the hud.ts /
 *  burnZones precedent: a backgrounded tab must not jump the wave). */
const MAX_ALERT_DT = 0.5;

/** The tint an OWN mine / zone wears: white (a Pixi tint of pure white is the
 *  identity — the geometry's own white). */
export const OWN_TINT = C.white;

/**
 * Pure: advance the alert PHASE (radians) by one frame. Negative or non-finite
 * dt advances nothing; a long gap advances by the 0.5 s clamp; the result wraps
 * into [0, 2π).
 */
export function advanceAlertPhase(phase: number, dtSec: number): number {
  const dt = Number.isFinite(dtSec) ? dtSec : 0;
  const step = Math.min(MAX_ALERT_DT, Math.max(0, dt));
  const base = Number.isFinite(phase) ? phase : 0;
  return (((base + ALERT_HZ * step * TAU) % TAU) + TAU) % TAU; // a negative or NaN input still lands in [0, 2π)
}

/**
 * Pure: the blend amount at a phase, in [0, 1] — 0 is ORANGE, 1 is YELLOW.
 * `intensity · (0.5 + 0.5·sin φ)`: full motion sweeps the whole range, reduced
 * half of it (orange ↔ midpoint), off holds at 0 (steady orange).
 */
export function alertMix(phase: number, motion: MotionLevel): number {
  const m = motionIntensity(motion) * (0.5 + 0.5 * Math.sin(phase));
  return Number.isFinite(m) ? Math.min(1, Math.max(0, m)) : 0;
}

function lerpChannel(a: number, b: number, shift: number, t: number): number {
  const ca = (a >> shift) & 0xff;
  const cb = (b >> shift) & 0xff;
  return Math.round(ca + (cb - ca) * t) << shift;
}

/** Pure: the 0xRRGGBB color at a blend amount — a per-channel RGB lerp from
 *  `colors.alertOrange` (mix 0) to `colors.alertYellow` (mix 1). Out-of-range
 *  or non-finite input is clamped (NaN → orange). */
export function alertColor(mix: number): number {
  const t = Number.isFinite(mix) ? Math.min(1, Math.max(0, mix)) : 0;
  const o = C.alertOrange;
  const y = C.alertYellow;
  return lerpChannel(o, y, 16, t) | lerpChannel(o, y, 8, t) | lerpChannel(o, y, 0, t);
}

/** Pure: `a` moved toward `b` by `t` in [0,1], per RGB channel (0xRRGGBB).
 *  Out-of-range or non-finite `t` is clamped (NaN → `a`). The burn zone's
 *  flames use it to take a SLIGHT share of the alert color (amendment 183). */
export function mixColor(a: number, b: number, t: number): number {
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return lerpChannel(a, b, 16, k) | lerpChannel(a, b, 8, k) | lerpChannel(a, b, 0, k);
}

/** Pure: the tint for another's mine / zone at a phase and motion level. */
export function alertTint(phase: number, motion: MotionLevel): number {
  return alertColor(alertMix(phase, motion));
}

/** The shared integrated clock: one phase for every warning on screen. */
export class AlertClock {
  phase = 0;
  private lastSec: number | null = null;

  /** Advance to `nowSec` (seconds). The first call only anchors the clock;
   *  the same `nowSec` twice advances nothing, so several renderers can call
   *  it in one frame and the phase still moves once. */
  advance(nowSec: number): void {
    if (!Number.isFinite(nowSec)) return;
    if (this.lastSec === nowSec) return;
    const dt = this.lastSec === null ? 0 : nowSec - this.lastSec;
    this.lastSec = nowSec;
    this.phase = advanceAlertPhase(this.phase, dt);
  }

  /** Back to a fresh clock (tests). */
  reset(): void {
    this.phase = 0;
    this.lastSec = null;
  }
}

/** THE clock — mines and all three zone kinds read this one instance. */
export const alertClock = new AlertClock();
