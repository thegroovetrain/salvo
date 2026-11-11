// The synthesis renderer's GRAPH (audio/synth/render.ts) against a fake
// context: which nodes a shot builds, what connects to what, the voice caps,
// cleanup on `ended`, and graceful degradation when a factory is missing.
// Never what anything sounds like.

import { describe, it, expect } from 'vitest';
import { Synth, DEFAULT_MAX_VOICES, applyEnvelope } from '../render.js';
import { SILENCE, cueLengthS, distanceShape, type CueRecipe } from '../recipe.js';
import { FakeAudioContext, downstream, fakeParam, seeded, type FakeNode, type FakeParam } from './fakeAudio.js';

const click: CueRecipe = {
  layers: [{ source: { kind: 'click', ms: 3 }, env: { peak: 1, attackMs: 0, tauMs: 300 }, modes: { f0: 200, ratios: [1, 1.47, 2.09], q: 50 } }],
};

/** A gun-like cue: soft-clipped sub sweep, swept-lowpass body, AM tail, echoes, reverb. */
const gun: CueRecipe = {
  layers: [
    { source: { kind: 'osc', wave: 'sine', freq: { from: 60, to: 26, ms: 300 } }, env: { peak: 1, attackMs: 2, tauMs: 350 }, drive: 3 },
    {
      source: { kind: 'noise', color: 'brown' },
      filters: [{ type: 'lowpass', freq: { from: 2500, to: 140, ms: 700 }, q: 0.8 }],
      env: { peak: 1, attackMs: 1, tauMs: 450 },
      jitter: { freq: 0.1, decay: 0.15, gainDb: 2 },
    },
    {
      source: { kind: 'noise', color: 'white' },
      filters: [{ type: 'highpass', freq: 1800 }],
      env: { peak: 0.5, attackMs: 0.5, tauMs: 18 },
      farCut: 0.5,
    },
    {
      source: { kind: 'noise', color: 'brown' },
      env: { peak: 0.6, attackMs: 5, tauMs: 1400 },
      am: { rateHz: 5, depth: 0.4, jitter: 0.2 },
    },
  ],
  reverb: 0.5,
  reverbHighpassHz: 180,
  echoes: [
    { delayMs: 420, gain: 0.35, lowpassHz: 500 },
    { delayMs: 950, gain: 0.2, lowpassHz: 500 },
  ],
};

/** Morse keying: one sine, grains on an explicit pattern, FM + vibrato for coverage. */
const morse: CueRecipe = {
  layers: [
    {
      source: { kind: 'osc', wave: 'sine', freq: 700, vibrato: { rateHz: 0.1, depth: 0.004 }, fm: { ratio: 1.4, index: { from: 5, to: 0, tauMs: 300 } } },
      env: { peak: 0.3, attackMs: 5, holdMs: 50, endMs: 60 },
      grains: { onsetsMs: [0, 120, 240, 420] },
    },
  ],
  family: 'beacon',
  maxVoices: 2,
};

function setup(missing: ConstructorParameters<typeof FakeAudioContext>[0] = [], maxVoices?: number) {
  const ctx = new FakeAudioContext(missing);
  const sink = ctx.node('sink');
  const synth = new Synth(ctx.asContext, sink as unknown as AudioNode, { maxVoices, rand: seeded(1) });
  return { ctx, sink, synth };
}

const sources = (ctx: FakeAudioContext) => ctx.built.filter((n) => n.started);
const signalEnds = (n: FakeNode, sink: FakeNode) => downstream(n).has(sink);
/** A modulator (LFO / FM) is a source → depth gain → params only. */
const isModulator = (s: FakeNode) =>
  s.outputs.length === 1 && (s.outputs[0] as FakeNode).outputs.every((o) => 'writes' in o);
const audible = (ctx: FakeAudioContext) => sources(ctx).filter((s) => !isModulator(s));

describe('Synth.play — graph', () => {
  it('every audible source reaches the sink through the signal path', () => {
    const { ctx, sink, synth } = setup();
    expect(synth.play(gun, { rand: seeded(2) })).toBe(true);
    expect(synth.play(morse, { rand: seeded(2) })).toBe(true);
    expect(audible(ctx).length).toBeGreaterThan(0);
    for (const s of audible(ctx)) expect(signalEnds(s, sink)).toBe(true);
  });

  it('modulators exist exactly for the AM, vibrato and FM a recipe asks for', () => {
    const { ctx, synth } = setup();
    synth.play(gun, { rand: seeded(2) });
    expect(sources(ctx).filter(isModulator)).toHaveLength(1); // the tail's AM
    const m = setup();
    m.synth.play(morse);
    // vibrato + FM per grain
    expect(sources(m.ctx).filter(isModulator)).toHaveLength(2 * morse.layers[0].grains!.onsetsMs!.length);
  });

  it('a panned cue builds exactly one panner holding the sanitized pan; no pan builds none', () => {
    const a = setup();
    a.synth.play(gun, { pan: 7, rand: seeded(1) });
    const panners = a.ctx.nodesOf('panner');
    expect(panners).toHaveLength(1);
    expect((panners[0].pan as FakeParam).writes[0].value).toBe(1);
    expect(panners[0].outputs).toContain(a.sink);
    const b = setup();
    b.synth.play(gun, { rand: seeded(1) });
    expect(b.ctx.nodesOf('panner')).toHaveLength(0);
  });

  it('a junk pan centres and a junk gain plays at the recipe level', () => {
    const { ctx, synth } = setup();
    synth.play(click, { pan: NaN, gain: NaN });
    expect((ctx.nodesOf('panner')[0].pan as FakeParam).writes[0].value).toBe(0);
    const cueIn = ctx.nodesOf('gain')[0];
    expect((cueIn.gain as FakeParam).writes[0].value).toBe(1);
  });

  it('the cue level is recipe gain × play gain', () => {
    const { ctx, synth } = setup();
    synth.play({ ...click, gain: 0.5 }, { gain: 0.4 });
    expect((ctx.nodesOf('gain')[0].gain as FakeParam).writes[0].value).toBeCloseTo(0.2);
  });

  it('one grain chain per planned grain: the Morse pattern builds one carrier per onset', () => {
    const { ctx, synth } = setup();
    synth.play(morse);
    const carriers = ctx.nodesOf('oscillator').filter((o) => o.type === 'sine' && (o.frequency as FakeParam).inputs.length > 0);
    expect(carriers).toHaveLength(morse.layers[0].grains!.onsetsMs!.length);
  });

  it('a modal bank builds one bandpass per ratio, all summing into the envelope', () => {
    const { ctx, synth } = setup();
    synth.play(click);
    const bps = ctx.nodesOf('biquad').filter((b) => b.type === 'bandpass');
    expect(bps).toHaveLength(click.layers[0].modes!.ratios.length);
    const envs = new Set(bps.map((b) => ((b.outputs[0] as FakeNode).outputs[0] as FakeNode)));
    expect(envs.size).toBe(1);
  });

  it('drive builds a 4x-oversampled shaper with a curve', () => {
    const { ctx, synth } = setup();
    synth.play(gun, { rand: seeded(3) });
    const [shaper] = ctx.nodesOf('shaper');
    expect(shaper.curve).toBeInstanceOf(Float32Array);
    expect(shaper.oversample).toBe('4x');
  });

  it('sources start at the cue time and stop no earlier than their envelope ends', () => {
    const { ctx, synth } = setup();
    synth.play(click, { delayS: 0.25 });
    for (const s of sources(ctx)) {
      expect(s.started![0]).toBeCloseTo(ctx.currentTime + 0.25);
      expect(s.stopped![0]).toBeGreaterThanOrEqual(s.started![0] + cueLengthS(click));
    }
  });

  it('every source stops by the recipe’s cueLengthS (plus the stop margin)', () => {
    const { ctx, synth } = setup();
    synth.play(gun, { rand: seeded(4) });
    for (const s of sources(ctx)) expect(s.stopped![0] - ctx.currentTime).toBeLessThanOrEqual(cueLengthS(gun) + 0.021);
  });
});

describe('Synth.play — distance', () => {
  it('a distant cue gets the distance lowpass, gain and pre-delay; a near one gets none', () => {
    const near = setup();
    near.synth.play(gun, { rand: seeded(1) });
    const nearFilters = near.ctx.nodesOf('biquad').length;

    const far = setup();
    const d = 0.8;
    const shape = distanceShape(d);
    far.synth.play(gun, { distance01: d, rand: seeded(1) });
    const freqs = far.ctx.nodesOf('biquad').map((b) => (b.frequency as FakeParam).writes[0].value);
    expect(freqs).toContain(shape.lowpassHz);
    expect((far.ctx.nodesOf('gain')[0].gain as FakeParam).writes[0].value).toBeCloseTo(shape.gain);
    for (const s of sources(far.ctx)) expect(s.started![0]).toBeGreaterThanOrEqual(far.ctx.currentTime + shape.preDelayS);
    // The crack layer (its one highpass) is past its farCut and gone, and the
    // distance lowpass is added: the biquad count nets out even.
    expect(far.ctx.nodesOf('biquad').length).toBe(nearFilters);
  });

  it('every filter holds its starting coefficients from build time, not only from its scheduled start', () => {
    // A resonator whose frequency / Q jump while it already carries signal
    // rings out far too hot; a delayed (distant) shot is where a source can
    // start a frame before its filter's scheduled values.
    const { ctx, synth } = setup();
    synth.play(click, { distance01: 0.8, rand: seeded(2) });
    const modes = ctx.nodesOf('biquad').filter((b) => b.type === 'bandpass');
    expect(modes.length).toBe(click.layers[0].modes!.ratios.length);
    for (const b of ctx.nodesOf('biquad')) {
      const f = b.frequency as FakeParam;
      expect(f.value).toBe(f.writes[0].value);
    }
    for (const b of modes) expect((b.Q as FakeParam).value).toBe(click.layers[0].modes!.q);
  });

  it('the reverb send rises with distance (wet multiplier)', () => {
    const sendLevel = (d: number) => {
      const { ctx, synth } = setup();
      synth.play(gun, { distance01: d, rand: seeded(1) });
      const conv = ctx.nodesOf('convolver')[0];
      const hp = ctx.built.find((n) => n.outputs.includes(conv)) as FakeNode;
      const send = ctx.built.find((n) => n.outputs.includes(hp)) as FakeNode;
      return (send.gain as FakeParam).writes[0].value;
    };
    expect(sendLevel(0.9)).toBeGreaterThan(sendLevel(0));
  });
});

describe('Synth — the shared reverb', () => {
  it('is ONE convolver for many shots, with a stereo buffer, connected to the sink', () => {
    const { ctx, sink, synth } = setup();
    synth.play(gun);
    synth.play(gun);
    const convs = ctx.nodesOf('convolver');
    expect(convs).toHaveLength(1);
    expect(convs[0].outputs).toContain(sink);
    expect((convs[0].buffer as AudioBuffer).numberOfChannels).toBe(2);
  });

  it('a dry recipe never builds it', () => {
    const { ctx, synth } = setup();
    synth.play(click);
    expect(ctx.nodesOf('convolver')).toHaveLength(0);
  });

  it('the send is highpassed when the recipe asks', () => {
    const { ctx, synth } = setup();
    synth.play(gun);
    const conv = ctx.nodesOf('convolver')[0];
    const feeders = ctx.built.filter((n) => n.outputs.includes(conv));
    expect(feeders.every((f) => f.kind === 'biquad' && f.type === 'highpass')).toBe(true);
  });
});

describe('Synth — voice cap', () => {
  it('at the global cap a new cue is dropped and builds nothing', () => {
    const { ctx, synth } = setup([], 2);
    expect(synth.play(click)).toBe(true);
    expect(synth.play(click)).toBe(true);
    const before = ctx.built.length;
    expect(synth.play(click)).toBe(false);
    expect(ctx.built.length).toBe(before);
    expect(synth.liveVoices).toBe(2);
  });

  it('a family cap drops only that family', () => {
    const { synth } = setup();
    const cap = morse.maxVoices!;
    for (let i = 0; i < cap; i++) expect(synth.play(morse)).toBe(true);
    expect(synth.play(morse)).toBe(false);
    expect(synth.familyVoices('beacon')).toBe(cap);
    expect(synth.play(click)).toBe(true);
  });

  it('defaults to DEFAULT_MAX_VOICES', () => {
    const { synth } = setup();
    let played = 0;
    while (synth.play(click) && played < 1000) played++;
    expect(played).toBe(DEFAULT_MAX_VOICES);
  });

  it('a zero-level or fully distance-cut cue is dropped', () => {
    const { synth } = setup();
    expect(synth.play(click, { gain: 0 })).toBe(false);
    expect(synth.play({ layers: [{ ...click.layers[0], farCut: 0.1 }] }, { distance01: 0.5 })).toBe(false);
    expect(synth.play({ layers: [] })).toBe(false);
    expect(synth.liveVoices).toBe(0);
  });
});

describe('Synth — cleanup', () => {
  it('the voice is released and every shot node disconnected when the last source ends', () => {
    const { ctx, sink, synth } = setup();
    synth.play(gun);
    synth.play(morse);
    expect(synth.liveVoices).toBe(2);
    ctx.endAll();
    expect(synth.liveVoices).toBe(0);
    expect(synth.familyVoices('beacon')).toBe(0);
    const perShot = ctx.built.filter((n) => n.kind !== 'convolver');
    for (const n of perShot) expect(n.disconnected).toBe(true);
    expect(sink.disconnected).toBe(false);
    expect(ctx.nodesOf('convolver')[0].disconnected).toBe(false);
  });

  it('the voice is held until the LAST source of the shot ends', () => {
    const { ctx, synth } = setup();
    synth.play(morse);
    const [first] = sources(ctx);
    first.onended!();
    expect(synth.liveVoices).toBe(1);
    expect(ctx.built.some((n) => n.disconnected)).toBe(false);
  });

  it('a released voice frees a slot', () => {
    const { ctx, synth } = setup([], 1);
    synth.play(click);
    expect(synth.play(click)).toBe(false);
    ctx.endAll();
    expect(synth.play(click)).toBe(true);
  });
});

describe('Synth — degradation', () => {
  it('missing panner / convolver / shaper / delay factories never throw and still play', () => {
    const { ctx, sink, synth } = setup(['createStereoPanner', 'createConvolver', 'createWaveShaper', 'createDelay']);
    expect(synth.play(gun, { pan: -0.5, distance01: 0.3 })).toBe(true);
    for (const kind of ['panner', 'convolver', 'shaper', 'delay']) expect(ctx.nodesOf(kind)).toHaveLength(0);
    for (const s of audible(ctx)) expect(signalEnds(s, sink)).toBe(true);
  });

  it('echoes build a delay → lowpass → gain each when DelayNode exists', () => {
    const { ctx, synth } = setup();
    synth.play(gun, { rand: seeded(1) });
    const delays = ctx.nodesOf('delay');
    expect(delays).toHaveLength(gun.echoes!.length);
    for (const d of delays) {
      const lp = d.outputs[0] as FakeNode;
      expect(lp.type).toBe('lowpass');
      expect((lp.outputs[0] as FakeNode).kind).toBe('gain');
    }
  });

  it('a factory that throws mid-build drops the cue, tears down what was built, and never throws', () => {
    const { ctx, synth } = setup();
    let calls = 0;
    const real = ctx.createBiquadFilter.bind(ctx);
    ctx.createBiquadFilter = () => {
      if (++calls > 1) throw new Error('boom');
      return real();
    };
    expect(() => synth.play(gun)).not.toThrow();
    expect(synth.liveVoices).toBe(0);
    for (const n of ctx.built.filter((b) => b.kind !== 'convolver')) expect(n.disconnected).toBe(true);
  });
});

describe('applyEnvelope', () => {
  it('starts and ends at the SILENCE floor, never targets 0, and peaks at the peak', () => {
    for (const env of [
      { peak: 0.8, attackMs: 5, tauMs: 100 },
      { peak: 0.8, attackMs: 0, holdMs: 20, endMs: 200 },
      { peak: 0, attackMs: 1, endMs: 10 },
    ]) {
      const p = fakeParam();
      applyEnvelope(p as unknown as AudioParam, env, 1, env.peak, 1);
      expect(p.writes[0].value).toBe(SILENCE);
      expect(p.writes[p.writes.length - 1].value).toBe(SILENCE);
      for (const w of p.writes) expect(w.value).toBeGreaterThanOrEqual(SILENCE);
      expect(Math.max(...p.writes.map((w) => w.value))).toBe(Math.max(SILENCE, env.peak));
    }
  });
});
