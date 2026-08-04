// Pure phosphor/blip/sweep math (render/phosphor.ts) — the decay and
// extrapolation the radar renderer applies per frame.

import { describe, it, expect } from 'vitest';
import { wrapPositive } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  BLIP_BRIGHT,
  BLIP_DARK,
  TINT_FADE_FRACTION,
  blipAlpha,
  blipCool,
  blipLifeMs,
  blipTint,
  lerpColor,
  sweepRotation,
} from '../render/phosphor.js';
import { luminanceFloor, relativeLuminance } from '../render/blipMarks.js';

const TAU = Math.PI * 2;
const PERIOD = 4000;
const SWEEPS = CLIENT_CONFIG.blip.persistSweeps;

describe('blipAlpha — linear 1 → 0 over the paint LIFE', () => {
  it('is 1 at paint time and 0 exactly one life later', () => {
    expect(blipAlpha(0, PERIOD)).toBe(1);
    expect(blipAlpha(PERIOD, PERIOD)).toBe(0);
  });

  it('is linear in between', () => {
    expect(blipAlpha(PERIOD / 2, PERIOD)).toBeCloseTo(0.5, 12);
    expect(blipAlpha(PERIOD / 4, PERIOD)).toBeCloseTo(0.75, 12);
  });

  it('clamps: never negative past a life, never above 1 for a skewed clock', () => {
    expect(blipAlpha(PERIOD * 2, PERIOD)).toBe(0);
    expect(blipAlpha(-50, PERIOD)).toBe(1); // clock jitter can make age < 0
  });
});

// --- Story 4.2 / amendment 9: three-paint persistence ------------------------
// A paint used to die exactly as the beam came back around. It now lives
// `persistSweeps` periods, so a contact leaves a plottable track: the live paint
// plus two decaying ghosts, whose SPACING encodes speed.

describe('blipLifeMs — a paint lives persistSweeps sweep periods', () => {
  it('multiplies the OBSERVER sweep period, so an upgraded sweep shortens the track', () => {
    expect(blipLifeMs(PERIOD)).toBe(PERIOD * SWEEPS);
    expect(blipLifeMs(PERIOD / 2)).toBe((PERIOD / 2) * SWEEPS);
    expect(SWEEPS).toBeGreaterThan(1); // the whole point: ghosts exist
  });

  it('leaves the ghosts alive across the sweeps that spawned them', () => {
    const life = blipLifeMs(PERIOD);
    // One and two sweeps old (the two ghosts) are still visible...
    expect(blipAlpha(PERIOD, life)).toBeCloseTo(1 - 1 / SWEEPS, 12);
    expect(blipAlpha(PERIOD * 2, life)).toBeCloseTo(1 - 2 / SWEEPS, 12);
    // ...and each is dimmer than the one before it (newest reads brightest).
    expect(blipAlpha(PERIOD * 2, life)).toBeLessThan(blipAlpha(PERIOD, life));
    expect(blipAlpha(PERIOD, life)).toBeLessThan(blipAlpha(0, life));
    // The third sweep retires it — exactly persistSweeps periods, not one.
    expect(blipAlpha(life, life)).toBe(0);
    expect(blipAlpha(PERIOD * (SWEEPS - 0.001), life)).toBeGreaterThan(0);
  });

  it('honours the assist alpha floor for the whole extended life', () => {
    const life = blipLifeMs(PERIOD);
    const floor = CLIENT_CONFIG.blip.assistMinAlpha;
    expect(blipAlpha(life - 1, life, floor)).toBe(floor);
    expect(blipAlpha(life, life, floor)).toBe(0); // the floor never extends life
  });
});

describe('blipCool — the HUE-PRESERVING cooling ramp', () => {
  const grey = (c: number): number[] => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

  it('is a neutral grey at every age, so a tinted blip keeps its hue exactly', () => {
    const life = blipLifeMs(PERIOD);
    for (const age of [0, 100, life * 0.1, life * 0.3, life * 0.9, life * 5]) {
      const [r, g, b] = grey(blipCool(age, life));
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });

  it('starts white (fresh) and cools to the configured floor, then holds', () => {
    const life = blipLifeMs(PERIOD);
    expect(blipCool(0, life)).toBe(0xffffff);
    const floorLevel = Math.round(255 * CLIENT_CONFIG.blip.coolFloor);
    expect(grey(blipCool(life * TINT_FADE_FRACTION, life))[0]).toBe(floorLevel);
    expect(grey(blipCool(life, life))[0]).toBe(floorLevel); // held, never darker
  });

  // Review catch: the assist's luminance floor is baked into the STROKE color
  // once, but this multiplier then scales every channel down — so the base
  // cooling ramp dragged a lifted dark hue back UNDER the floor for most of a
  // paint's life, silently undoing the assist for the exact hues it rescues.
  // The assist therefore cools on its own shallower ramp.
  it('cools a colorblind-assist paint shallowly enough to KEEP its luminance floor', () => {
    const life = blipLifeMs(PERIOD);
    const { assistCoolFloor, assistLumaFloor, lumaFloor } = CLIENT_CONFIG.blip;
    // A fully-cooled assist paint must still outrank a fully-cooled base paint.
    const assistLevel = grey(blipCool(life, life, assistCoolFloor))[0];
    expect(assistLevel).toBeGreaterThan(grey(blipCool(life, life))[0]);

    // The real guarantee, end to end: lift the DARKEST Regatta hue to the
    // assist floor, apply the fully-cooled multiplier, and the result must
    // still clear the BASE floor — the failure mode was landing far below it.
    const darkest = Object.values(CLIENT_CONFIG.colors.players).reduce((a, b) =>
      relativeLuminance(a) <= relativeLuminance(b) ? a : b,
    );
    const lifted = luminanceFloor(darkest, assistLumaFloor);
    const mul = assistLevel / 255;
    const ch = (shift: number): number => Math.round(((lifted >> shift) & 0xff) * mul) << shift;
    expect(relativeLuminance(ch(16) | ch(8) | ch(0))).toBeGreaterThanOrEqual(lumaFloor);
  });

  it('cools monotonically through the fade window (fresh reads hottest)', () => {
    const life = blipLifeMs(PERIOD);
    const fadeMs = life * TINT_FADE_FRACTION;
    let prev = grey(blipCool(0, life))[0];
    for (const k of [0.25, 0.5, 0.75, 1]) {
      const level = grey(blipCool(fadeMs * k, life))[0];
      expect(level).toBeLessThan(prev);
      prev = level;
    }
  });
});

describe('lerpColor — per-channel interpolation', () => {
  it('returns the endpoints at t=0 and t=1 (and clamps beyond)', () => {
    expect(lerpColor(0x123456, 0xabcdef, 0)).toBe(0x123456);
    expect(lerpColor(0x123456, 0xabcdef, 1)).toBe(0xabcdef);
    expect(lerpColor(0x123456, 0xabcdef, -3)).toBe(0x123456);
    expect(lerpColor(0x123456, 0xabcdef, 7)).toBe(0xabcdef);
  });

  it('mixes each channel independently', () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0xff0000, 0x00ff00, 0.5)).toBe(0x808000);
  });
});

// blipTint SETS a color, so it now belongs to the pre-join ambient scope only
// (its dots have no owner and no class). The in-game scope's cooling is blipCool
// above, which multiplies instead — see the phosphor.ts header.
describe('blipTint — bright → dark phosphor over the first ~30% of life', () => {
  it('starts bright and is fully dark from the fade fraction onward', () => {
    expect(blipTint(0, PERIOD)).toBe(BLIP_BRIGHT);
    expect(blipTint(PERIOD * TINT_FADE_FRACTION, PERIOD)).toBe(BLIP_DARK);
    expect(blipTint(PERIOD, PERIOD)).toBe(BLIP_DARK);
  });

  it('cools monotonically (green channel falls) through the fade window', () => {
    const green = (c: number) => (c >> 8) & 0xff;
    const fadeMs = PERIOD * TINT_FADE_FRACTION;
    let prev = green(blipTint(0, PERIOD));
    for (const k of [0.25, 0.5, 0.75, 1]) {
      const g = green(blipTint(fadeMs * k, PERIOD));
      expect(g).toBeLessThan(prev);
      prev = g;
    }
  });
});

describe('sweepRotation — 60fps extrapolation of the 20Hz sweep angle', () => {
  it('returns the frame angle when no time has passed', () => {
    expect(sweepRotation(1.25, 1000, 1000, PERIOD)).toBeCloseTo(1.25, 12);
  });

  it('advances at exactly 2π per period', () => {
    expect(sweepRotation(0, 0, PERIOD / 4, PERIOD)).toBeCloseTo(TAU / 4, 12);
    expect(sweepRotation(1, 500, 500 + PERIOD / 2, PERIOD)).toBeCloseTo(wrapPositive(1 + Math.PI), 12);
  });

  it('wraps into [0, 2π)', () => {
    const r = sweepRotation(TAU - 0.01, 0, PERIOD / 8, PERIOD); // +π/4 past the wrap
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(TAU);
    expect(r).toBeCloseTo(TAU / 8 - 0.01, 12);
  });

  it('never runs backward when the clock lags the frame timestamp', () => {
    expect(sweepRotation(2, 1000, 900, PERIOD)).toBe(2);
  });

  it('is seamless across frame re-anchors (server + extrapolation agree)', () => {
    // A frame 50ms later carries the angle advanced by exactly one tick's worth;
    // extrapolating the OLD frame to that moment must land on the same rotation.
    const dtMs = 50;
    const a0 = 3.1;
    const a1 = wrapPositive(a0 + (TAU * dtMs) / PERIOD);
    expect(sweepRotation(a0, 0, dtMs, PERIOD)).toBeCloseTo(sweepRotation(a1, dtMs, dtMs, PERIOD), 12);
  });
});
