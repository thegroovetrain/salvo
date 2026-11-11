// THE LAYERED-CUE PATH ON THE GAME BUS (Story 10.13, audio/context.ts
// `playCue`, `engineBus`, `setSinkFade`) against the synthesis fake context.
// Graph and arithmetic only: what reaches the bus, what is built when, what
// the fallback plays, where the sinking insert sits. Never how it sounds.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Audio, legacyCueGain } from '../context.js';
import { CUES } from '../synth/cues.js';
import { TONES } from '../tones.js';
import { CLIENT_CONFIG } from '../../config.js';
import { settings } from '../../settings/store.js';
import { FakeAudioContext, downstream, type FakeNode, type FakeParam, type OptionalFactory } from '../synth/__tests__/fakeAudio.js';

type Ctx = FakeAudioContext & { resume: () => Promise<void> };

function setup(missing: readonly OptionalFactory[] = [], strip: readonly string[] = []): { audio: Audio; ctx: Ctx } {
  const ctx = new FakeAudioContext(missing) as Ctx;
  ctx.resume = () => Promise.resolve();
  for (const f of strip) (ctx as unknown as Record<string, unknown>)[f] = undefined;
  (window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx;
  };
  const audio = new Audio();
  audio.resume();
  return { audio, ctx };
}

/** The bus gains in build order: mono, master, master-chain output (no
 *  DynamicsCompressor in this fake → a pass-through gain), effects. */
const buses = (ctx: FakeAudioContext) => {
  const [mono, master, chain, effects] = ctx.nodesOf('gain');
  return { mono, master, chain, effects };
};

let restore: unknown;
beforeEach(() => {
  restore = (window as unknown as { AudioContext?: unknown }).AudioContext;
  settings.reset();
});
afterEach(() => {
  (window as unknown as { AudioContext?: unknown }).AudioContext = restore;
  settings.reset();
});

describe('playCue — the layered path', () => {
  it('builds the picked recipe and every source reaches the destination through the bus', () => {
    const { audio, ctx } = setup();
    const before = ctx.built.length;
    audio.playCue('hitCall');
    const shot = ctx.built.slice(before);
    const sources = shot.filter((n) => n.started?.length);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(downstream(s).has(buses(ctx).effects)).toBe(true);
    expect(downstream(buses(ctx).effects).has(ctx.destination)).toBe(true);
  });

  it('the bus order is effects → master chain → master → mono → destination', () => {
    const { ctx } = setup();
    const b = buses(ctx);
    expect(b.effects.outputs).toEqual([b.chain]);
    expect(b.chain.outputs).toEqual([b.master]);
    expect(b.master.outputs).toEqual([b.mono]);
    expect(b.mono.outputs).toEqual([ctx.destination]);
  });

  it('builds nothing while muted, while ducked, or before resume', () => {
    const { audio, ctx } = setup();
    settings.set({ muted: true });
    const before = ctx.built.length;
    audio.playCue('mainBattery');
    expect(ctx.built.length).toBe(before);
    settings.set({ muted: false });
    audio.duck();
    audio.playCue('mainBattery');
    expect(ctx.built.length).toBe(before);
    const fresh = new Audio(); // never resumed: no context at all
    expect(() => fresh.playCue('mainBattery')).not.toThrow();
  });

  it('pitch transposes the shot’s oscillators (junk pitch is untransposed)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // the same per-shot draws every run
    const freqs = (pitch?: number): number[] => {
      const { audio, ctx } = setup();
      audio.playCue('boostSurge', { pitch }); // the picked take carries an oscillator layer
      return ctx.nodesOf('oscillator').flatMap((o) => (o.frequency as FakeParam).writes.map((w) => w.value));
    };
    const base = freqs();
    expect(base.length).toBeGreaterThan(0);
    expect(freqs(2)).toEqual(base.map((f) => f * 2));
    expect(freqs(NaN)).toEqual(base);
    vi.restoreAllMocks();
  });

  it('falls back to the LEGACY tone when a node type the layered path needs is missing', () => {
    const { audio, ctx } = setup([], ['createBiquadFilter']);
    audio.playCue('ownHit', { gain: 0.5 });
    const oscs = ctx.nodesOf('oscillator');
    expect(oscs).toHaveLength(1); // the one-oscillator legacy `damage` tone
    expect((oscs[0].frequency as FakeParam).writes[0].value).toBe(TONES.damage.freqStart);
    expect(downstream(oscs[0]).has(buses(ctx).effects)).toBe(true);
  });

  it('a cue with no legacy row falls back to silence, never a throw', () => {
    const { audio, ctx } = setup([], ['createBiquadFilter']);
    const before = ctx.built.length;
    expect(() => audio.playCue('beacon')).not.toThrow();
    expect(ctx.built.length).toBe(before);
  });

  it('a factory that THROWS mid-build degrades to the legacy tone', () => {
    const { audio, ctx } = setup();
    (ctx as unknown as { createBiquadFilter: () => never }).createBiquadFilter = () => {
      throw new Error('boom');
    };
    expect(() => audio.playCue('steelHit', { pan: 0.3, distance01: 0.5 })).not.toThrow();
    const oscs = ctx.nodesOf('oscillator');
    expect(oscs.some((o) => (o.frequency as FakeParam).writes[0]?.value === TONES.impact.freqStart)).toBe(true);
  });

  it('the fallback plays a placed cue at the legacy world level (one curve, never two)', () => {
    const floor = CLIENT_CONFIG.audio.worldFloorGain;
    expect(legacyCueGain(undefined, 0)).toBe(1);
    expect(legacyCueGain(undefined, 1)).toBeCloseTo(floor, 10);
    expect(legacyCueGain(0.5, 1)).toBeCloseTo(0.5 * floor, 10);
    expect(legacyCueGain(undefined, undefined)).toBe(1);
    expect(legacyCueGain(undefined, NaN)).toBe(1);
  });

  it('a world cue past the world cap is dropped; an own cue still plays', () => {
    const { audio, ctx } = setup();
    // Fill the world tier with cheap near hits across several families.
    for (let i = 0; i < CLIENT_CONFIG.audio.worldCueVoiceCap * 2; i++) {
      audio.playCue(i % 2 ? 'steelHit' : 'secondariesWorld', { distance01: 0 });
      audio.playCue('mainBatteryWorld', { distance01: 0 });
      audio.playCue('sinkWitness', { distance01: 0 });
    }
    const before = ctx.built.length;
    audio.playCue('steelHit', { distance01: 0 });
    expect(ctx.built.length).toBe(before); // the world tier is full
    audio.playCue('hitCall');
    expect(ctx.built.length).toBeGreaterThan(before); // own cues keep their room
  });
});

describe('engineBus', () => {
  it('is null before resume, and while muted or ducked; else the context and the effects bus', () => {
    expect(new Audio().engineBus()).toBeNull();
    const { audio, ctx } = setup();
    const bus = audio.engineBus();
    expect(bus?.sink).toBe(buses(ctx).effects as unknown as AudioNode);
    settings.set({ muted: true });
    expect(audio.engineBus()).toBeNull();
    settings.set({ muted: false });
    audio.duck();
    expect(audio.engineBus()).toBeNull();
  });
});

describe('setSinkFade — the sinking insert', () => {
  it('splices between the master chain and the master gain, and unplugs back to the plain chain', () => {
    const { audio, ctx } = setup();
    const b = buses(ctx);
    audio.setSinkFade(0.3);
    const insert = b.chain.outputs.at(-1) as FakeNode;
    expect(insert).not.toBe(b.master);
    expect(b.chain.disconnected).toBe(true);
    expect(downstream(insert).has(b.master)).toBe(true);
    const built = ctx.built.length;
    audio.setSinkFade(0.8); // the same insert glides; nothing new is built
    expect(ctx.built.length).toBe(built);
    audio.setSinkFade(null);
    expect(b.chain.outputs.at(-1)).toBe(b.master);
    expect(insert.disconnected).toBe(true);
  });

  it('is a no-op before the context exists', () => {
    expect(() => new Audio().setSinkFade(0.5)).not.toThrow();
  });
});

describe('the shipped cue table on this path', () => {
  it('every cue renders through the fake without throwing', () => {
    for (const id of Object.keys(CUES) as (keyof typeof CUES)[]) {
      const { audio } = setup();
      expect(() => audio.playCue(id, { pan: 0.2, distance01: 0.3 }), id).not.toThrow();
    }
  });
});
