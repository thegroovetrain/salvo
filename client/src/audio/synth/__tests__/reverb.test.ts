// Contracts of the generated open-water IR (audio/synth/reverb.ts): sparse
// early reflections inside their window, independent channels, a decaying
// tail, determinism, and the stereo buffer wrapper. Not how it sounds.

import { describe, it, expect } from 'vitest';
import { IR, fillOpenWaterIR, reverbBuffer } from '../reverb.js';
import { FakeAudioContext, seeded } from './fakeAudio.js';

const RATE = 8000;

function render(seed: number): [Float32Array, Float32Array] {
  const n = Math.floor(RATE * IR.lengthS);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  fillOpenWaterIR(l, r, RATE, seeded(seed));
  return [l, r];
}

const nonZeroIdx = (d: Float32Array, from: number, to: number): number[] => {
  const out: number[] = [];
  for (let i = from; i < to; i++) if (d[i] !== 0) out.push(i);
  return out;
};

const rms = (d: Float32Array, from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

describe('fillOpenWaterIR', () => {
  it('before the tail there are only sparse reflections, inside the early window, at most earlyMax per channel', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const ch of render(seed)) {
        const early = nonZeroIdx(ch, 0, Math.floor(IR.tailStartS * RATE));
        expect(early.length).toBeGreaterThan(0);
        expect(early.length).toBeLessThanOrEqual(IR.earlyMax);
        for (const i of early) {
          expect(i).toBeGreaterThanOrEqual(Math.floor(IR.earlyMinS * RATE));
          expect(i).toBeLessThanOrEqual(Math.floor(IR.earlyMaxS * RATE));
        }
      }
    }
  });

  it('the two channels are independent', () => {
    const [l, r] = render(3);
    const tail = Math.floor(IR.tailStartS * RATE);
    expect(nonZeroIdx(l, 0, tail)).not.toEqual(nonZeroIdx(r, 0, tail));
    expect(Array.from(l.subarray(tail, tail + 100))).not.toEqual(Array.from(r.subarray(tail, tail + 100)));
  });

  it('the tail decays: each later second is quieter than the one before', () => {
    const [l] = render(5);
    const start = Math.floor(IR.tailStartS * RATE);
    const sec = (k: number) => rms(l, start + k * RATE, Math.min(l.length, start + (k + 1) * RATE));
    expect(sec(1)).toBeLessThan(sec(0));
    expect(sec(2)).toBeLessThan(sec(1));
  });

  it('is finite everywhere and deterministic under a seeded rand', () => {
    const [a] = render(11);
    const [b] = render(11);
    expect(a).toEqual(b);
    expect(a.every(Number.isFinite)).toBe(true);
  });
});

describe('reverbBuffer', () => {
  it('builds one stereo buffer of IR.lengthS at the context rate', () => {
    const ctx = new FakeAudioContext();
    const buf = reverbBuffer(ctx.asContext, seeded(1));
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBe(Math.floor(ctx.sampleRate * IR.lengthS));
    expect(rms(buf.getChannelData(1), 0, buf.length)).toBeGreaterThan(0);
  });
});
