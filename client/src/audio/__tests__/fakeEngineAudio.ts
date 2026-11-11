// A minimal fake BaseAudioContext for the engine-voice graph tests. Every node
// and param records what the voice did to it (connections, scheduled writes,
// start / stop, disconnect) so the tests can assert the GRAPH — never a sound.

export interface ParamWrite {
  readonly method: string;
  readonly value: number;
  readonly time: number;
}

export interface FakeParam {
  readonly kind: 'param';
  readonly owner: FakeNode;
  value: number;
  readonly writes: ParamWrite[];
  setTargetAtTime: (v: number, t: number, tau: number) => FakeParam;
  setValueAtTime: (v: number, t: number) => FakeParam;
  linearRampToValueAtTime: (v: number, t: number) => FakeParam;
  exponentialRampToValueAtTime: (v: number, t: number) => FakeParam;
  cancelScheduledValues: (t: number) => FakeParam;
}

export interface FakeNode {
  readonly kind: string;
  readonly outputs: Array<FakeNode | FakeParam>;
  disconnected: boolean;
  starts: number;
  stops: number;
  onended: (() => void) | null;
  connect: (target: FakeNode | FakeParam) => FakeNode | FakeParam;
  disconnect: () => void;
  start: () => void;
  stop: () => void;
  [k: string]: unknown;
}

function makeParam(owner: FakeNode, initial: number): FakeParam {
  const p: FakeParam = {
    kind: 'param',
    owner,
    value: initial,
    writes: [],
    setTargetAtTime: (value, time) => (p.writes.push({ method: 'target', value, time }), p),
    setValueAtTime: (value, time) => (p.writes.push({ method: 'set', value, time }), p),
    linearRampToValueAtTime: (value, time) => (p.writes.push({ method: 'linear', value, time }), p),
    exponentialRampToValueAtTime: (value, time) => (p.writes.push({ method: 'exp', value, time }), p),
    cancelScheduledValues: (time) => (p.writes.push({ method: 'cancel', value: NaN, time }), p),
  };
  return p;
}

export type Factory = 'createStereoPanner' | 'createWaveShaper' | 'createPeriodicWave';

export class FakeEngineCtx {
  currentTime = 10;
  readonly sampleRate = 8000;
  readonly built: FakeNode[] = [];
  readonly sink: FakeNode;

  constructor(missing: readonly Factory[] = []) {
    this.sink = this.node('sink', [], false);
    for (const f of missing) (this as unknown as Record<string, unknown>)[f] = undefined;
  }

  private node(kind: string, params: string[], track = true): FakeNode {
    const n = {
      kind,
      outputs: [] as Array<FakeNode | FakeParam>,
      disconnected: false,
      starts: 0,
      stops: 0,
      onended: null,
      connect(target: FakeNode | FakeParam) {
        n.outputs.push(target);
        return target;
      },
      disconnect() {
        n.disconnected = true;
      },
      start() {
        n.starts++;
      },
      stop() {
        n.stops++;
      },
    } as FakeNode;
    for (const name of params) n[name] = makeParam(n, 0);
    if (track) this.built.push(n);
    return n;
  }

  createGain(): FakeNode {
    const n = this.node('gain', ['gain']);
    (n.gain as FakeParam).value = 1;
    return n;
  }
  createBiquadFilter(): FakeNode {
    return this.node('biquad', ['frequency', 'Q', 'gain', 'detune']);
  }
  createOscillator(): FakeNode {
    const n = this.node('oscillator', ['frequency', 'detune']);
    n.setPeriodicWave = (w: unknown) => void (n.wave = w);
    return n;
  }
  createBufferSource(): FakeNode {
    return this.node('bufferSource', ['playbackRate', 'detune']);
  }
  createWaveShaper(): FakeNode {
    return this.node('shaper', []);
  }
  createStereoPanner(): FakeNode {
    return this.node('panner', ['pan']);
  }
  createPeriodicWave(real: Float32Array): { real: Float32Array } {
    return { real };
  }
  createBuffer(_ch: number, length: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }

  of(kind: string): FakeNode[] {
    return this.built.filter((n) => n.kind === kind);
  }
  sources(): FakeNode[] {
    return this.built.filter((n) => n.kind === 'oscillator' || n.kind === 'bufferSource');
  }
  /** Every param write on every built node, flattened. */
  allWrites(): ParamWrite[] {
    return this.built.flatMap((n) =>
      Object.values(n).flatMap((v) => (v && (v as FakeParam).kind === 'param' ? (v as FakeParam).writes : [])),
    );
  }
}

/** Does `from` reach the sink, following node and param (→ owner) edges? */
export function reaches(from: FakeNode, sink: FakeNode): boolean {
  const seen = new Set<FakeNode>();
  const stack: FakeNode[] = [from];
  while (stack.length > 0) {
    const n = stack.pop() as FakeNode;
    if (n === sink) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const o of n.outputs) stack.push(o.kind === 'param' ? (o as FakeParam).owner : (o as FakeNode));
  }
  return false;
}

/** A deterministic rand so noise fills and offsets do not depend on Math.random. */
export const fixedRand = (): number => 0.5;
