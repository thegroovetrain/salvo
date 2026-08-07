// THE HORN CATALOG + THE SAMPLE SEAM (Story 4.5, amendments 52 + 57).
//
// WebAudio is not testable in node, so audio/horns.ts holds everything that can
// be a pure function or an injectable object and audio/context.ts holds only the
// node graph. This suite covers that pure half: the catalog and its unknown-id
// fallback, the standard voice's SHAPE (a horn, not a beep), the one piece of
// gain arithmetic, and the buffer cache's three rules — cache, dedupe, sticky
// failure.

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HORN_ID, HORN_IDS, type HornId } from '@salvo/shared';
import {
  HORNS,
  HORN_MAX_CONCURRENT,
  HornBufferCache,
  MAX_HORN_S,
  hornGain,
  hornVoice,
  type HornSynthVoice,
} from '../audio/horns.js';

/** A stand-in for a decoded buffer — nothing here inspects one. */
const fakeBuffer = (tag = 'buf'): AudioBuffer => ({ tag }) as unknown as AudioBuffer;

const STANDARD = HORNS[DEFAULT_HORN_ID] as HornSynthVoice;

describe('HORNS — exactly one shipped horn, total over the shared catalog', () => {
  it('has a row for every shared HornId and no orphan rows', () => {
    expect(Object.keys(HORNS).sort()).toEqual([...HORN_IDS].sort());
  });

  it('ships EXACTLY ONE horn — a second variant is CONTENT and Eric-gated (amendment 52)', () => {
    expect(Object.keys(HORNS)).toHaveLength(1);
    expect(Object.keys(HORNS)).toEqual(['standard']);
  });

  it('ships no sample-backed catalog entry — no licensed recording exists (amendment 57)', () => {
    const sampled = (Object.keys(HORNS) as HornId[]).filter((id) => HORNS[id].kind === 'sample');
    expect(sampled).toEqual([]);
  });
});

describe('hornVoice — unknown ids degrade to a SOUND, never silence or a throw', () => {
  it('resolves the shipped id to its own voice', () => {
    expect(hornVoice('standard')).toBe(HORNS.standard);
  });

  it('falls back to the default for an id this client does not know (old client, new horn)', () => {
    expect(hornVoice('brass-leviathan')).toBe(HORNS[DEFAULT_HORN_ID]);
  });

  it('falls back for junk of every shape without throwing', () => {
    const junk: unknown[] = ['', '   ', null, undefined, 0, 42, NaN, true, {}, [], 'constructor', '__proto__'];
    for (const raw of junk) {
      expect(() => hornVoice(raw as string)).not.toThrow();
      expect(hornVoice(raw as string)).toBe(HORNS[DEFAULT_HORN_ID]);
    }
  });
});

describe('the standard horn — a ship, not a beep (amendment 57)', () => {
  it('is the synthesized voice, since the sample path ships unused', () => {
    expect(STANDARD.kind).toBe('synth');
  });

  it('stacks several partials — the beating between them IS the character', () => {
    expect(STANDARD.layers.length).toBeGreaterThanOrEqual(2);
  });

  it('carries at least one DETUNED twin (remove it and this is a synth pad)', () => {
    const detuned = STANDARD.layers.filter((l) => (l.detuneCents ?? 0) !== 0);
    expect(detuned.length).toBeGreaterThanOrEqual(1);
  });

  it('sits LOW — a hull-sized object, not a whistle', () => {
    const fundamental = Math.min(...STANDARD.layers.map((l) => l.freq));
    expect(fundamental).toBeGreaterThanOrEqual(80);
    expect(fundamental).toBeLessThanOrEqual(140);
  });

  it('swells and tails rather than clicking on and off', () => {
    expect(STANDARD.attackS).toBeGreaterThan(0);
    expect(STANDARD.releaseS).toBeGreaterThan(0);
    // Attack + release must fit inside the blast, or the envelope has no middle.
    expect(STANDARD.attackS + STANDARD.releaseS).toBeLessThanOrEqual(STANDARD.durationS);
  });

  it('is ~1.8s and inside the horn ceiling', () => {
    expect(STANDARD.durationS).toBeCloseTo(1.8, 5);
    expect(STANDARD.durationS).toBeGreaterThan(0);
    expect(STANDARD.durationS).toBeLessThanOrEqual(MAX_HORN_S);
  });

  it('has a sane level, and layer weights that do not blow past it', () => {
    expect(STANDARD.volume).toBeGreaterThan(0);
    expect(STANDARD.volume).toBeLessThanOrEqual(1);
    const sum = STANDARD.layers.reduce((a, l) => a + l.gain, 0);
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThanOrEqual(1.0001);
  });

  it('holds every catalog voice inside MAX_HORN_S', () => {
    for (const id of Object.keys(HORNS) as HornId[]) {
      const v = HORNS[id];
      if (v.kind === 'synth') expect(v.durationS).toBeLessThanOrEqual(MAX_HORN_S);
      expect(v.volume).toBeGreaterThan(0);
      expect(v.volume).toBeLessThanOrEqual(1);
    }
  });

  it('caps the mix at a small number of simultaneous horns', () => {
    expect(HORN_MAX_CONCURRENT).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(HORN_MAX_CONCURRENT)).toBe(true);
  });
});

describe('hornGain — voice level x the listener band multiplier', () => {
  it('multiplies the two, unclamped in the normal range', () => {
    expect(hornGain(STANDARD, 1)).toBeCloseTo(STANDARD.volume, 6);
    expect(hornGain(STANDARD, 0.75)).toBeCloseTo(STANDARD.volume * 0.75, 6);
    expect(hornGain(STANDARD, 0.5)).toBeCloseTo(STANDARD.volume * 0.5, 6);
  });

  it('is monotone across the earshot bands', () => {
    const [t1, t2, t3] = [1, 0.75, 0.5].map((g) => hornGain(STANDARD, g));
    expect(t1).toBeGreaterThan(t2);
    expect(t2).toBeGreaterThan(t3);
  });

  it('clamps a band multiplier outside 0..1 instead of trusting it', () => {
    expect(hornGain(STANDARD, 4)).toBeCloseTo(STANDARD.volume, 6);
    expect(hornGain(STANDARD, -1)).toBe(0);
  });

  it('maps junk to 0 rather than NaN (a NaN gain poisons a Web Audio param)', () => {
    for (const junk of [NaN, Infinity, -Infinity, undefined as unknown as number]) {
      expect(hornGain(STANDARD, junk)).toBe(0);
    }
  });
});

describe('HornBufferCache — the sample seam, exercised by tests only', () => {
  it('peeks empty before anything is loaded', () => {
    const cache = new HornBufferCache(() => Promise.resolve(fakeBuffer()));
    expect(cache.get('/horn.mp3')).toBeUndefined();
    expect(cache.hasFailed('/horn.mp3')).toBe(false);
  });

  it('decodes once and then serves the buffer synchronously', async () => {
    const buf = fakeBuffer();
    const fetchDecode = vi.fn(() => Promise.resolve(buf));
    const cache = new HornBufferCache(fetchDecode);
    await expect(cache.load('/horn.mp3')).resolves.toBe(buf);
    expect(cache.get('/horn.mp3')).toBe(buf);
    await expect(cache.load('/horn.mp3')).resolves.toBe(buf);
    expect(fetchDecode).toHaveBeenCalledTimes(1);
  });

  it('DEDUPES in-flight loads — three captains honking the same horn open ONE fetch', async () => {
    let resolveIt: (b: AudioBuffer) => void = () => undefined;
    const fetchDecode = vi.fn(() => new Promise<AudioBuffer>((res) => (resolveIt = res)));
    const cache = new HornBufferCache(fetchDecode);
    const a = cache.load('/horn.mp3');
    const b = cache.load('/horn.mp3');
    const c = cache.load('/horn.mp3');
    expect(fetchDecode).toHaveBeenCalledTimes(1);
    const buf = fakeBuffer();
    resolveIt(buf);
    expect(await Promise.all([a, b, c])).toEqual([buf, buf, buf]);
    expect(fetchDecode).toHaveBeenCalledTimes(1);
  });

  it('keeps separate urls separate', async () => {
    const fetchDecode = vi.fn((url: string) => Promise.resolve(fakeBuffer(url)));
    const cache = new HornBufferCache(fetchDecode);
    const [a, b] = await Promise.all([cache.load('/a.mp3'), cache.load('/b.mp3')]);
    expect(a).not.toBe(b);
    expect(fetchDecode).toHaveBeenCalledTimes(2);
  });

  it('resolves NULL on a rejection and never throws', async () => {
    const cache = new HornBufferCache(() => Promise.reject(new Error('404')));
    await expect(cache.load('/missing.mp3')).resolves.toBeNull();
    expect(cache.get('/missing.mp3')).toBeUndefined();
  });

  it('treats a SYNCHRONOUS throw from fetchDecode as a failure too', async () => {
    const cache = new HornBufferCache(() => {
      throw new Error('no context');
    });
    await expect(cache.load('/boom.mp3')).resolves.toBeNull();
    expect(cache.hasFailed('/boom.mp3')).toBe(true);
  });

  it('treats a missing buffer as a failure rather than caching undefined', async () => {
    const cache = new HornBufferCache(() => Promise.resolve(undefined as unknown as AudioBuffer));
    await expect(cache.load('/empty.mp3')).resolves.toBeNull();
    expect(cache.hasFailed('/empty.mp3')).toBe(true);
    expect(cache.get('/empty.mp3')).toBeUndefined();
  });

  it('makes failure STICKY — a bad url is never retried this session (no request storm)', async () => {
    const fetchDecode = vi.fn(() => Promise.reject(new Error('404')));
    const cache = new HornBufferCache(fetchDecode);
    await cache.load('/missing.mp3');
    expect(cache.hasFailed('/missing.mp3')).toBe(true);
    await expect(cache.load('/missing.mp3')).resolves.toBeNull();
    await expect(cache.load('/missing.mp3')).resolves.toBeNull();
    expect(fetchDecode).toHaveBeenCalledTimes(1);
  });

  it('does not mark an unrelated url failed', async () => {
    const fetchDecode = vi.fn((url: string) =>
      url === '/bad.mp3' ? Promise.reject(new Error('404')) : Promise.resolve(fakeBuffer(url)),
    );
    const cache = new HornBufferCache(fetchDecode);
    await cache.load('/bad.mp3');
    expect(cache.hasFailed('/bad.mp3')).toBe(true);
    expect(cache.hasFailed('/good.mp3')).toBe(false);
    await expect(cache.load('/good.mp3')).resolves.toBeTruthy();
  });
});
