// THE AUDIO ADAPTER's graph (audio/context.ts), pinned against a minimal fake
// AudioContext.
//
// This file exists because Story 4.7 gave the adapter an ACCEPTANCE CRITERION —
// "given monoAudio is on, when a panned world cue plays, then it folds to
// centre" — and the module's long-standing "thin adapter, deliberately not unit
// tested" convention predates a change with a contract of its own. The 4.7 work
// added the `cueSink` panner splice, the `cueGain`/`cuePan` sanitisers and the
// `spec.volume * gain` multiply; none of that is pure-table logic that
// audio/tones.ts can cover, and all of it is exactly the kind of graph wiring
// that breaks silently.
//
// What is covered is the GRAPH and the ARITHMETIC — which nodes get built, what
// connects to what, and what numbers land on the params. Nothing here asserts on
// how anything SOUNDS: timbre lives in the tone table (tones.test.ts), and the
// browser's own mixing is not ours to test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Audio } from '../context.js';
import { TONES } from '../tones.js';
import { settings } from '../../settings/store.js';

// --- the fake AudioContext ---------------------------------------------------
//
// Every node records the calls the adapter makes on it, and `connect` returns
// its target so the `osc.connect(gain).connect(sink)` chaining idiom works
// exactly as it does against the real API.

interface FakeParam {
  value: number;
  setValueAtTime: (v: number, t: number) => void;
  linearRampToValueAtTime: (v: number, t: number) => void;
  exponentialRampToValueAtTime: (v: number, t: number) => void;
  /** Every value written to this param, in order (however it was written). */
  writes: number[];
}

interface FakeNode {
  kind: string;
  connect: (target: FakeNode) => FakeNode;
  /** What this node is connected INTO. */
  outputs: FakeNode[];
  [k: string]: unknown;
}

function param(initial = 0): FakeParam {
  const p: FakeParam = {
    value: initial,
    writes: [],
    setValueAtTime: (v) => void p.writes.push(v),
    linearRampToValueAtTime: (v) => void p.writes.push(v),
    exponentialRampToValueAtTime: (v) => void p.writes.push(v),
  };
  return p;
}

class FakeCtx {
  currentTime = 12.5;
  sampleRate = 48_000;
  readonly destination: FakeNode = this.node('destination');
  /** Every node built through this context, in creation order. */
  readonly built: FakeNode[] = [];

  private node(kind: string, extra: Record<string, unknown> = {}): FakeNode {
    const n: FakeNode = {
      kind,
      outputs: [],
      connect(target: FakeNode) {
        n.outputs.push(target);
        return target;
      },
      ...extra,
    };
    return n;
  }

  private track(n: FakeNode): FakeNode {
    this.built.push(n);
    return n;
  }

  createGain(): FakeNode {
    return this.track(
      this.node('gain', {
        gain: param(1),
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
      }),
    );
  }

  createOscillator(): FakeNode {
    return this.track(
      this.node('oscillator', {
        type: 'sine',
        frequency: param(),
        detune: param(),
        start: () => undefined,
        stop: () => undefined,
      }),
    );
  }

  createStereoPanner(): FakeNode {
    return this.track(this.node('panner', { pan: param(0) }));
  }

  createBuffer(channels: number, length: number, rate: number): { getChannelData: () => Float32Array } {
    void channels;
    void rate;
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }

  createBufferSource(): FakeNode {
    return this.track(this.node('bufferSource', { buffer: null, start: () => undefined }));
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }
}

/** A resumed Audio over a fresh fake context. */
function setup(): { audio: Audio; ctx: FakeCtx } {
  const ctx = new FakeCtx();
  (window as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx;
  };
  const audio = new Audio();
  audio.resume();
  return { audio, ctx };
}

const nodesOf = (ctx: FakeCtx, kind: string): FakeNode[] => ctx.built.filter((n) => n.kind === kind);
/** The three bus gains, in build order: mono, master, effects (buildBuses). */
const buses = (ctx: FakeCtx) => {
  const [mono, master, effects] = nodesOf(ctx, 'gain');
  return { mono, master, effects };
};
/** The peak the tone's own gain envelope ramps to (playOscillator writes
 *  SILENCE, then the peak, then SILENCE again). */
const peakOf = (gain: FakeNode): number => (gain.gain as FakeParam).writes[1];

let restore: unknown;

beforeEach(() => {
  restore = (window as unknown as { AudioContext?: unknown }).AudioContext;
  settings.reset();
});

afterEach(() => {
  (window as unknown as { AudioContext?: unknown }).AudioContext = restore;
  settings.reset();
});

describe('the bus chain', () => {
  it('routes effects -> master -> mono -> destination', () => {
    const { ctx } = setup();
    const { mono, master, effects } = buses(ctx);
    expect(effects.outputs).toEqual([master]);
    expect(master.outputs).toEqual([mono]);
    expect(mono.outputs).toEqual([ctx.destination]);
  });

  // The downmix is the channel COUNT plus the explicit mode — a 1-channel
  // 'explicit'/'speakers' gain folds its stereo input to one channel, which the
  // destination then plays to both ears.
  it('the mono node is stereo by default and 1-channel with monoAudio on', () => {
    const { ctx } = setup();
    const { mono } = buses(ctx);
    expect(mono.channelCountMode).toBe('explicit');
    expect(mono.channelInterpretation).toBe('speakers');
    expect(mono.channelCount).toBe(2);
    settings.set({ monoAudio: true });
    expect(mono.channelCount).toBe(1);
  });
});

describe('play() without a pan — the pre-4.7 graph, byte for byte', () => {
  it('builds NO panner and connects the tone straight into the effects bus', () => {
    const { audio, ctx } = setup();
    audio.play('sunkWitness'); // a spec with no noise layer: one oscillator, one gain
    expect(nodesOf(ctx, 'panner')).toHaveLength(0);
    const [osc] = nodesOf(ctx, 'oscillator');
    const toneGain = nodesOf(ctx, 'gain')[3]; // after the three buses
    expect(osc.outputs).toEqual([toneGain]);
    expect(toneGain.outputs).toEqual([buses(ctx).effects]);
  });

  it('plays at the spec volume exactly — an absent gain is 1, never a re-scale', () => {
    const { audio, ctx } = setup();
    audio.play('sunkWitness');
    expect(peakOf(nodesOf(ctx, 'gain')[3])).toBe(TONES.sunkWitness.volume);
  });

  it('is silent while muted (no nodes built at all)', () => {
    const { audio, ctx } = setup();
    settings.set({ muted: true });
    const before = ctx.built.length;
    audio.play('sunkWitness');
    expect(ctx.built.length).toBe(before);
  });
});

describe('play() with a pan — the sound map splice', () => {
  it('builds ONE panner and routes tone -> panner -> effects', () => {
    const { audio, ctx } = setup();
    audio.play('sunkWitness', { pan: 0.5 });
    const panners = nodesOf(ctx, 'panner');
    expect(panners).toHaveLength(1);
    expect(panners[0].outputs).toEqual([buses(ctx).effects]);
    const toneGain = nodesOf(ctx, 'gain')[3];
    expect(toneGain.outputs).toEqual([panners[0]]);
    // ...and the rest of the chain is unchanged, so a panned cue reaches the
    // destination through the same mute/volume/mono controls as every other.
    expect(buses(ctx).effects.outputs).toEqual([buses(ctx).master]);
    expect(buses(ctx).master.outputs).toEqual([buses(ctx).mono]);
    expect(buses(ctx).mono.outputs).toEqual([ctx.destination]);
  });

  it('THE MONO ACCEPTANCE CRITERION: with monoAudio on a panned cue folds to centre', () => {
    // The pan is still WRITTEN — the panner is a real node in the graph — but the
    // 1-channel mono bus downstream collapses it, which is the whole reason that
    // bus was plumbed in Story 2.3 and why the toggle stopped being a no-op.
    const { audio, ctx } = setup();
    settings.set({ monoAudio: true });
    audio.play('gunReport', { pan: -0.7 });
    const panner = nodesOf(ctx, 'panner')[0];
    expect((panner.pan as FakeParam).writes).toEqual([-0.7]);
    expect(buses(ctx).mono.channelCount).toBe(1);
  });

  it('THE NOISE LAYER SHARES THE PANNER — a panned crack does not leave its transient centred', () => {
    const { audio, ctx } = setup();
    audio.play('gunReport', { pan: 0.6 }); // gunReport carries a noise transient
    const panner = nodesOf(ctx, 'panner')[0];
    const [src] = nodesOf(ctx, 'bufferSource');
    const noiseGain = nodesOf(ctx, 'gain').at(-1) as FakeNode;
    expect(src.outputs).toEqual([noiseGain]);
    expect(noiseGain.outputs).toEqual([panner]);
  });

  it('...and the noise rides the SAME attenuated level as the tone, not a full-gain one', () => {
    // One level for the whole cue: a distant crack that kept a full-level
    // transient would sound like a near shot that lost its body.
    const { audio, ctx } = setup();
    audio.play('gunReport', { gain: 0.5 });
    const gains = nodesOf(ctx, 'gain');
    const tonePeak = peakOf(gains[3]);
    const noisePeak = (gains.at(-1)!.gain as FakeParam).writes[0];
    expect(tonePeak).toBeCloseTo(TONES.gunReport.volume * 0.5, 10);
    expect(noisePeak).toBeCloseTo(tonePeak * 0.5, 10); // the fixed noise fraction
  });

  it('a browser with no createStereoPanner plays the cue CENTRED rather than not at all', () => {
    // A presentation shortfall must never become silence (the horn's
    // asset-fallback rule): the cue falls back to the bare bus.
    const { audio, ctx } = setup();
    (ctx as unknown as { createStereoPanner?: unknown }).createStereoPanner = undefined;
    audio.play('sunkWitness', { pan: 0.9 });
    expect(nodesOf(ctx, 'panner')).toHaveLength(0);
    expect(nodesOf(ctx, 'gain')[3].outputs).toEqual([buses(ctx).effects]);
  });
});

describe('the cue knobs sanitise rather than throw or silence', () => {
  // Junk must never THROW and must never SILENCE a cue: a cue heard at the wrong
  // level is a bug, a missing cue is a lie about what happened on the water.

  it('gain multiplies the spec volume, and clamps into 0..1', () => {
    const { audio, ctx } = setup();
    audio.play('sunkWitness', { gain: 0.25 });
    audio.play('sunkWitness', { gain: 5 }); // over range -> 1
    audio.play('sunkWitness', { gain: -3 }); // under range -> 0
    const gains = nodesOf(ctx, 'gain');
    expect(peakOf(gains[3])).toBeCloseTo(TONES.sunkWitness.volume * 0.25, 10);
    expect(peakOf(gains[4])).toBe(TONES.sunkWitness.volume);
    expect(peakOf(gains[5])).toBe(0);
  });

  it('a non-finite gain degrades to 1 — the spec plays at its own level', () => {
    const { audio, ctx } = setup();
    audio.play('sunkWitness', { gain: NaN });
    audio.play('sunkWitness', { gain: Infinity });
    const gains = nodesOf(ctx, 'gain');
    expect(peakOf(gains[3])).toBe(TONES.sunkWitness.volume);
    expect(peakOf(gains[4])).toBe(TONES.sunkWitness.volume);
  });

  it('pan clamps into -1..1', () => {
    const { audio, ctx } = setup();
    audio.play('sunkWitness', { pan: 4 });
    audio.play('sunkWitness', { pan: -4 });
    const [a, b] = nodesOf(ctx, 'panner');
    expect((a.pan as FakeParam).writes).toEqual([1]);
    expect((b.pan as FakeParam).writes).toEqual([-1]);
  });

  it('a non-finite pan degrades to dead centre — and still builds the panner', () => {
    const { audio, ctx } = setup();
    audio.play('sunkWitness', { pan: NaN });
    const [panner] = nodesOf(ctx, 'panner');
    expect((panner.pan as FakeParam).writes).toEqual([0]);
  });

  it('an explicit pan of 0 is a PLACED cue (centre), not an absent one', () => {
    // `pan: 0` means "this happened dead ahead"; only `undefined` means "not
    // placed". The splice keys on presence, never on truthiness.
    const { audio, ctx } = setup();
    audio.play('sunkWitness', { pan: 0 });
    expect(nodesOf(ctx, 'panner')).toHaveLength(1);
  });
});
