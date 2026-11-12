// A minimal fake BaseAudioContext for the synthesis path's GRAPH tests
// (the context.test.ts style, made reusable). Every node records what it is
// connected into, whether it was disconnected, and every write to its params;
// scheduled sources record start/stop and expose `onended`, which `endAll()`
// fires the way a real context does when the stop time passes. Nothing here
// produces or judges sound.

export interface ParamWrite {
  method: string;
  value: number;
  time: number;
}

export interface FakeParam {
  value: number;
  writes: ParamWrite[];
  /** Nodes connected INTO this param (LFOs, FM deviation). */
  inputs: FakeNode[];
  setValueAtTime: (v: number, t: number) => FakeParam;
  linearRampToValueAtTime: (v: number, t: number) => FakeParam;
  exponentialRampToValueAtTime: (v: number, t: number) => FakeParam;
  setTargetAtTime: (v: number, t: number, tau: number) => FakeParam;
  cancelScheduledValues: (t: number) => FakeParam;
}

export interface FakeNode {
  kind: string;
  outputs: (FakeNode | FakeParam)[];
  disconnected: boolean;
  connect: (target: FakeNode | FakeParam) => FakeNode | FakeParam;
  disconnect: () => void;
  onended?: (() => void) | null;
  started?: number[];
  stopped?: number[];
  [k: string]: unknown;
}

function isParam(t: FakeNode | FakeParam): t is FakeParam {
  return 'writes' in t;
}

export function fakeParam(initial = 0): FakeParam {
  const p: FakeParam = {
    value: initial,
    writes: [],
    inputs: [],
    setValueAtTime: (value, time) => (p.writes.push({ method: 'set', value, time }), p),
    linearRampToValueAtTime: (value, time) => (p.writes.push({ method: 'linear', value, time }), p),
    exponentialRampToValueAtTime: (value, time) => {
      if (!(value > 0)) throw new RangeError('exponential ramp target must be positive');
      p.writes.push({ method: 'exp', value, time });
      return p;
    },
    setTargetAtTime: (value, time) => (p.writes.push({ method: 'target', value, time }), p),
    cancelScheduledValues: (time) => (p.writes.push({ method: 'cancel', value: NaN, time }), p),
  };
  return p;
}

/** Factories a test may remove to simulate an older browser. */
export type OptionalFactory = 'createStereoPanner' | 'createConvolver' | 'createWaveShaper' | 'createDelay' | 'createPeriodicWave';

export class FakeAudioContext {
  currentTime = 10;
  sampleRate = 8000;
  readonly destination: FakeNode = this.node('destination');
  /** Every node built through this context, in creation order. */
  readonly built: FakeNode[] = [];
  buffersCreated = 0;

  constructor(missing: readonly OptionalFactory[] = []) {
    for (const f of missing) (this as unknown as Record<string, unknown>)[f] = undefined;
  }

  node(kind: string, extra: Record<string, unknown> = {}): FakeNode {
    const n: FakeNode = {
      kind,
      outputs: [],
      disconnected: false,
      connect(target) {
        n.outputs.push(target);
        if (isParam(target)) target.inputs.push(n);
        return target;
      },
      disconnect() {
        n.disconnected = true;
      },
      ...extra,
    };
    return n;
  }

  private track(n: FakeNode): FakeNode {
    this.built.push(n);
    return n;
  }

  private source(kind: string, extra: Record<string, unknown>): FakeNode {
    const n = this.node(kind, { started: [], stopped: [], onended: null, ...extra });
    n.start = (t = 0) => void n.started?.push(t);
    n.stop = (t = this.currentTime) => void n.stopped?.push(t);
    return this.track(n);
  }

  createGain(): FakeNode {
    return this.track(this.node('gain', { gain: fakeParam(1) }));
  }

  createBiquadFilter(): FakeNode {
    return this.track(this.node('biquad', { type: 'lowpass', frequency: fakeParam(350), Q: fakeParam(1), gain: fakeParam(0) }));
  }

  createOscillator(): FakeNode {
    const o = this.source('oscillator', { type: 'sine', frequency: fakeParam(440), detune: fakeParam(0), wave: null });
    o.setPeriodicWave = (w: unknown) => {
      o.type = 'custom';
      o.wave = w;
    };
    return o;
  }

  createBufferSource(): FakeNode {
    return this.source('bufferSource', { buffer: null, loop: false });
  }

  createStereoPanner(): FakeNode {
    return this.track(this.node('panner', { pan: fakeParam(0) }));
  }

  createWaveShaper(): FakeNode {
    return this.track(this.node('shaper', { curve: null, oversample: 'none' }));
  }

  createDelay(max = 1): FakeNode {
    return this.track(this.node('delay', { maxDelayTime: max, delayTime: fakeParam(0) }));
  }

  createPeriodicWave(real: Float32Array, imag: Float32Array): { real: Float32Array; imag: Float32Array } {
    return { real, imag };
  }

  createConvolver(): FakeNode {
    return this.track(this.node('convolver', { buffer: null, normalize: true }));
  }

  createBuffer(channels: number, length: number, rate: number): AudioBuffer {
    this.buffersCreated++;
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      duration: length / rate,
      getChannelData: (c: number) => data[c],
    } as unknown as AudioBuffer;
  }

  /** Fire `onended` on every started source (the stop time has passed). */
  endAll(): void {
    for (const n of this.built) if (n.started?.length && n.onended) n.onended();
  }

  nodesOf(kind: string): FakeNode[] {
    return this.built.filter((n) => n.kind === kind);
  }

  /** As the BaseAudioContext the code under test expects. */
  get asContext(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }
}

/** Every node reachable downstream of `from` through node connections
 *  (param connections are modulation, not signal path, and are not followed). */
export function downstream(from: FakeNode): Set<FakeNode> {
  const seen = new Set<FakeNode>();
  const walk = (n: FakeNode): void => {
    for (const o of n.outputs) {
      if (isParam(o) || seen.has(o)) continue;
      seen.add(o);
      walk(o);
    }
  };
  walk(from);
  return seen;
}

/** A deterministic LCG in [0, 1) — tests never depend on Math.random. */
export function seeded(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
