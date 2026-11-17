// Contracts of the shared synthesis raw material (audio/synth/noise.ts): one
// cached buffer per (context, color), offsets that leave the asked runway,
// and a soft-clip curve that is odd, bounded and unity at the rails.

import { describe, it, expect } from 'vitest';
import { NOISE_BUFFER_S, noiseBuffer, noiseOffset, softClipCurve, type NoiseColor } from '../noise.js';
import { FakeAudioContext, seeded } from './fakeAudio.js';

const COLORS: NoiseColor[] = ['white', 'pink', 'brown'];

describe('noiseBuffer', () => {
  it('builds one buffer per color per context and reuses it', () => {
    const ctx = new FakeAudioContext();
    for (const c of COLORS) expect(noiseBuffer(ctx.asContext, c)).toBe(noiseBuffer(ctx.asContext, c));
    expect(ctx.buffersCreated).toBe(COLORS.length);
    const other = new FakeAudioContext();
    expect(noiseBuffer(other.asContext, 'white')).not.toBe(noiseBuffer(ctx.asContext, 'white'));
  });

  it('is NOISE_BUFFER_S long, finite and not silent, for every color', () => {
    const ctx = new FakeAudioContext();
    for (const c of COLORS) {
      const buf = noiseBuffer(ctx.asContext, c, seeded(2));
      const data = buf.getChannelData(0);
      expect(buf.length).toBe(Math.floor(ctx.sampleRate * NOISE_BUFFER_S));
      expect(data.every(Number.isFinite)).toBe(true);
      expect(data.some((v) => v !== 0)).toBe(true);
    }
  });

  it('white and brown stay within ±1 (white by construction, brown by its clamp)', () => {
    const ctx = new FakeAudioContext();
    for (const c of ['white', 'brown'] as const) {
      expect(noiseBuffer(ctx.asContext, c, seeded(4)).getChannelData(0).every((v) => v >= -1 && v <= 1)).toBe(true);
    }
  });
});

describe('noiseOffset', () => {
  it('leaves at least `needS` of buffer after the offset', () => {
    for (const need of [0, 1, 3.5]) {
      expect(noiseOffset(need, () => 0.999999) + need).toBeLessThanOrEqual(NOISE_BUFFER_S);
      expect(noiseOffset(need, () => 0)).toBe(0);
    }
  });

  it('a need longer than the buffer (or negative) never yields a negative offset', () => {
    expect(noiseOffset(NOISE_BUFFER_S * 2, () => 0.5)).toBe(0);
    expect(noiseOffset(-1, () => 0.5)).toBeGreaterThanOrEqual(0);
  });
});

describe('softClipCurve', () => {
  it('is odd, monotone, bounded by ±1 and unity at the rails', () => {
    const c = softClipCurve(3, 257);
    expect(c[0]).toBeCloseTo(-1);
    expect(c[c.length - 1]).toBeCloseTo(1);
    for (let i = 0; i < c.length; i++) {
      expect(c[i]).toBeCloseTo(-c[c.length - 1 - i]);
      if (i > 0) expect(c[i]).toBeGreaterThan(c[i - 1]);
    }
  });

  it('more drive bends harder (a quiet input comes out louder)', () => {
    const quarter = (k: number) => {
      const c = softClipCurve(k, 257);
      return c[Math.round((c.length - 1) * 0.625)]; // input x = 0.25
    };
    expect(quarter(4)).toBeGreaterThan(quarter(1));
  });

  it('junk or non-positive k degrades to the identity line', () => {
    for (const k of [NaN, 0, -2]) {
      const c = softClipCurve(k, 5);
      expect(Array.from(c)).toEqual([-1, -0.5, 0, 0.5, 1]);
    }
  });
});
